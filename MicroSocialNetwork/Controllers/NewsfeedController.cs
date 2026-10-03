using Microsoft.AspNetCore.Mvc;
using Neo4j.Driver;
using System;
using System.Linq;
using System.Threading.Tasks;
using StackExchange.Redis;
using System.Text.Json;

namespace MicroSocialNetwork.Controllers
{
    [ApiController]
    [Route("api/posts")]
    public class NewsfeedController : ControllerBase
    {
        private readonly IDriver _driver;
        private readonly IConnectionMultiplexer _redis;

        public NewsfeedController(IDriver driver, IConnectionMultiplexer redis)
        {
            _driver = driver;
            _redis = redis;
        }

        // ==========================================
        // 1. LẤY BẢNG TIN
        // ==========================================
        [HttpGet]
        public async Task<IActionResult> GetNewsfeed([FromQuery] string userId)
        {
            var currentUserId = string.IsNullOrEmpty(userId) ? "1" : userId;
            var db = _redis.GetDatabase();
            string cacheKey = $"newsfeed:{currentUserId}";

            // 1. Kiểm tra cache trong Redis
            try
            {
                var cachedData = await db.StringGetAsync(cacheKey);
                if (cachedData.HasValue)
                {
                    var cachedJson = JsonDocument.Parse(cachedData.ToString()).RootElement;
                    return Ok(new { success = true, fromCache = true, data = cachedJson });
                }
            }
            catch
            {
                // Nếu Redis gặp sự cố, hệ thống vẫn chạy tiếp để lấy từ Neo4j
            }

            // 2. Cache Miss: Truy vấn dữ liệu thực từ Neo4j
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));

            var cypher = @"
                MATCH (author:User)-[:POSTED]->(p:Post)
                WHERE author.userId = toInteger($myId) OR (author)-[:FRIEND|FOLLOW]-(:User {userId: toInteger($myId)})
                OPTIONAL MATCH (p)<-[like:LIKED]-()
                OPTIONAL MATCH (p)<-[:ON_POST]-(c:Comment)
                OPTIONAL MATCH (me:User {userId: toInteger($myId)})-[myLike:LIKED]->(p)
                RETURN 
                    p.postId AS id, p.content AS content, p.createdAt AS createdAt, 
                    p.imageUrl AS imageUrl, p.videoUrl AS videoUrl,
                    author.userId AS authorId, author.username AS username, 
                    author.name AS fullName, author.avatarUrl AS avatarUrl,
                    count(DISTINCT like) AS likeCount, 
                    count(DISTINCT c) AS commentCount,
                    myLike IS NOT NULL AS isLiked
                ORDER BY p.createdAt DESC LIMIT 20";

            var posts = await session.ExecuteReadAsync(async tx =>
            {
                var result = await tx.RunAsync(cypher, new { myId = currentUserId });
                var records = await result.ToListAsync();

                return records.Select(r => new
                {
                    id = r["id"].As<long>().ToString(),
                    content = r["content"].As<string>(),
                    createdAt = r["createdAt"].As<string>(),
                    imageUrl = r["imageUrl"]?.As<string>() ?? "",
                    videoUrl = r["videoUrl"]?.As<string>() ?? "",
                    author = new
                    {
                        id = r["authorId"].As<long>().ToString(),
                        username = r["username"].As<string>(),
                        fullName = r["fullName"].As<string>(),
                        avatarUrl = r["avatarUrl"]?.As<string>() ?? ""
                    },
                    stats = new
                    {
                        likeCount = r["likeCount"].As<long>(),
                        commentCount = r["commentCount"].As<long>(),
                        shareCount = 0
                    },
                    userInteraction = new { isLiked = r["isLiked"].As<bool>() }
                }).ToList();
            });

            var responseData = new { posts = posts, hasMore = false };

            // 3. Lưu kết quả vào Redis với thời gian sống (TTL) 60 giây
            try
            {
                await db.StringSetAsync(
                    cacheKey,
                    JsonSerializer.Serialize(responseData),
                    TimeSpan.FromSeconds(60)
                );
            }
            catch { }

            return Ok(new { success = true, fromCache = false, data = responseData });
        }

        // ==========================================
        // 2. ĐĂNG BÀI VIẾT
        // ==========================================
        public class CreatePostDto { public string userId { get; set; } public string content { get; set; } public string imageUrl { get; set; } public string videoUrl { get; set; } }

        [HttpPost]
        public async Task<IActionResult> CreatePost([FromBody] CreatePostDto request)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));

            // Tạo ID ngẫu nhiên cho bài viết mới
            long newPostId = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string createdAt = DateTime.UtcNow.ToString("O");
            var cypher = @"
                MATCH (u:User {userId: toInteger($userId)})
                CREATE (p:Post {postId: $postId, content: $content, createdAt: $createdAt, imageUrl: $imageUrl, videoUrl: $videoUrl})
                MERGE (u)-[:POSTED]->(p)";

            await session.ExecuteWriteAsync(async tx => {
                await tx.RunAsync(cypher, new
                {
                    userId = request.userId,
                    postId = newPostId,
                    content = request.content,
                    createdAt = createdAt,
                    imageUrl = request.imageUrl ?? "",
                    videoUrl = request.videoUrl ?? ""
                });
            });
            try
            {
                var db = _redis.GetDatabase();
                await db.KeyDeleteAsync($"newsfeed:{request.userId}");
            }
            catch { }
            return Ok(new { success = true, message = "Đăng bài thành công!" });
        }

        // ==========================================
        // 3. THÍCH / BỎ THÍCH
        // ==========================================
        public class LikeRequest { public string userId { get; set; } public string action { get; set; } }

        [HttpPost("{postId}/like")]
        public async Task<IActionResult> ToggleLike(string postId, [FromBody] LikeRequest request)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            bool isLikeAction = request.action == "LIKE";

            var cypher = isLikeAction
                ? @"MATCH (u:User {userId: toInteger($userId)}), (p:Post {postId: toInteger($postId)}) MERGE (u)-[:LIKED]->(p)"
                : @"MATCH (u:User {userId: toInteger($userId)})-[r:LIKED]->(p:Post {postId: toInteger($postId)}) DELETE r";

            await session.ExecuteWriteAsync(async tx => await tx.RunAsync(cypher, new { userId = request.userId, postId }));

            var countCypher = "MATCH (p:Post {postId: toInteger($postId)})<-[r:LIKED]-() RETURN count(r) AS likeCount";
            var newLikeCount = await session.ExecuteReadAsync(async tx => {
                var res = await tx.RunAsync(countCypher, new { postId });
                return (await res.SingleAsync())["likeCount"].As<long>();
            });
            try
            {
                var db = _redis.GetDatabase();
                await db.KeyDeleteAsync($"newsfeed:{request.userId}");
            }
            catch { }
            return Ok(new { success = true, data = new { isLiked = isLikeAction, newLikeCount = newLikeCount } });
        }

        // ==========================================
        // 4. BÌNH LUẬN & CHIA SẺ
        // ==========================================
        public class CommentRequest { public string userId { get; set; } public string content { get; set; } }

        [HttpPost("{postId}/comments")]
        public async Task<IActionResult> AddComment(string postId, [FromBody] CommentRequest request)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            long newCommentId = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            var cypher = @"
                MATCH (u:User {userId: toInteger($userId)}), (p:Post {postId: toInteger($postId)})
                CREATE (c:Comment {commentId: $commentId, content: $content})
                MERGE (u)-[:COMMENTED]->(c)
                MERGE (c)-[:ON_POST]->(p)";

            await session.ExecuteWriteAsync(async tx => await tx.RunAsync(cypher, new { userId = request.userId, postId, commentId = newCommentId, content = request.content }));
            // Xóa cache của người vừa bình luận để nạp lại số liệu mới
            try
            {
                var db = _redis.GetDatabase();
                await db.KeyDeleteAsync($"newsfeed:{request.userId}");
            }
            catch { }

            return Ok(new { success = true, message = "Đã thêm bình luận" });
        }

        public class ShareRequest { public string userId { get; set; } public string recipientId { get; set; } }
        [HttpPost("{postId}/share")]
        public IActionResult SharePost(string postId, [FromBody] ShareRequest request) => Ok(new { success = true });

        // ==========================================
        // 5. LẤY DANH SÁCH TƯƠNG TÁC KHI BẤM VÀO THỐNG KÊ
        // ==========================================
        [HttpGet("{postId}/interactions")]
        public async Task<IActionResult> GetInteractions(string postId)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));

            // Lấy danh sách người đã thả Like
            var likeCypher = @"MATCH (p:Post {postId: toInteger($postId)})<-[:LIKED]-(u:User) RETURN u.userId AS id, u.name AS fullName, u.username AS username";
            var likes = await session.ExecuteReadAsync(async tx => {
                var res = await tx.RunAsync(likeCypher, new { postId });
                var records = await res.ToListAsync();
                return records.Select(r => new { user = new { id = r["id"].As<long>().ToString(), fullName = r["fullName"].As<string>(), username = r["username"].As<string>() } }).ToList();
            });

            // Lấy danh sách Comment
            var cmtCypher = @"MATCH (p:Post {postId: toInteger($postId)})<-[:ON_POST]-(c:Comment)<-[:COMMENTED]-(u:User) RETURN u.name AS fullName, c.content AS content";
            var comments = await session.ExecuteReadAsync(async tx => {
                var res = await tx.RunAsync(cmtCypher, new { postId });
                var records = await res.ToListAsync();
                return records.Select(r => new { user = new { fullName = r["fullName"].As<string>() }, content = r["content"].As<string>() }).ToList();
            });

            return Ok(new { success = true, data = new { likes = likes, comments = comments, shares = new object[] { } } });
        }

        // ==========================================
        // 6. XÓA BÀI VIẾT
        // ==========================================
        [HttpDelete("{postId}")]
        public async Task<IActionResult> DeletePost(string postId)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            // Xóa bài viết và toàn bộ quan hệ (POSTED, LIKED, Comment) gắn với nó
            var cypher = @"
                            MATCH (p:Post {postId: toInteger($postId)})
                            OPTIONAL MATCH (p)<-[:ON_POST]-(c:Comment)
                            DETACH DELETE c, p";

            await session.ExecuteWriteAsync(async tx => await tx.RunAsync(cypher, new { postId }));
            try
            {
                var db = _redis.GetDatabase();
                await db.KeyDeleteAsync($"newsfeed:1");
            }
            catch { }
            return Ok(new { success = true, message = "Đã xóa bài viết thành công" });
        }
    }
}