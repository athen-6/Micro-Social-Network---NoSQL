using Microsoft.AspNetCore.Mvc;
using Neo4j.Driver;
using System.Linq;
using System.Threading.Tasks;

namespace MicroSocialNetwork.Controllers
{
    [ApiController]
    [Route("api/users")]
    public class UsersController : ControllerBase
    {
        private readonly IDriver _driver;

        public UsersController(IDriver driver)
        {
            _driver = driver;
        }

        // 1. API DÀNH CHO THANH TÌM KIẾM BẢNG TIN
        [HttpGet]
        public async Task<IActionResult> GetAllUsers()
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            var cypher = @"
                MATCH (u:User) 
                RETURN u.userId AS id, u.username AS username, u.name AS fullName, u.avatarUrl AS avatarUrl";

            var users = await session.ExecuteReadAsync(async tx =>
            {
                var result = await tx.RunAsync(cypher);
                var records = await result.ToListAsync();
                return records.Select(r => new
                {
                    id = r["id"].As<object>()?.ToString() ?? "",
                    username = r["username"].As<object>()?.ToString() ?? "",
                    fullName = r["fullName"].As<object>()?.ToString() ?? "",
                    avatarUrl = r["avatarUrl"].As<object>()?.ToString() ?? ""
                }).ToList();
            });

            return Ok(new { success = true, data = new { users = users } });
        }

        // 2. API TÌM KIẾM TRỰC TIẾP
        [HttpGet("search")]
        public async Task<IActionResult> SearchUsers([FromQuery] string? q)
        {
            string searchKeyword = q ?? "";
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            var cypher = @"
                MATCH (u:User) 
                WHERE toLower(coalesce(u.name, '')) CONTAINS toLower($kw) 
                RETURN u.userId AS id, u.username AS username, u.name AS fullName, u.avatarUrl AS avatarUrl LIMIT 10";

            var users = await session.ExecuteReadAsync(async tx =>
            {
                var result = await tx.RunAsync(cypher, new { kw = searchKeyword.Trim() });
                var records = await result.ToListAsync();
                return records.Select(r => new {
                    id = r["id"].As<object>()?.ToString() ?? "",
                    username = r["username"].As<object>()?.ToString() ?? "",
                    fullName = r["fullName"].As<object>()?.ToString() ?? "",
                    avatarUrl = r["avatarUrl"].As<object>()?.ToString() ?? ""
                }).ToList();
            });
            return Ok(new { success = true, data = new { users = users } });
        }

        // 3. LẤY THÔNG TIN CÁ NHÂN
        [HttpGet("{id}")]
        public async Task<IActionResult> GetUserProfile(string id)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            var cypher = "MATCH (u:User {userId: toInteger($userId)}) RETURN u.userId AS id, u.username AS username, u.name AS fullName, u.avatarUrl AS avatarUrl LIMIT 1";
            var result = await session.ExecuteReadAsync(async tx => {
                var cursor = await tx.RunAsync(cypher, new { userId = id });
                if (await cursor.FetchAsync())
                {
                    var record = cursor.Current;
                    return new { id = record["id"].As<object>()?.ToString() ?? "", username = record["username"].As<object>()?.ToString() ?? "", fullName = record["fullName"].As<object>()?.ToString() ?? "", avatarUrl = record["avatarUrl"].As<object>()?.ToString() ?? "" };
                }
                return null;
            });
            if (result == null) return NotFound(new { success = false, message = "Không tìm thấy người dùng" });
            return Ok(new { success = true, data = new { user = result } });
        }

        // 4. LẤY THỐNG KÊ
        [HttpGet("{id}/stats")]
        public async Task<IActionResult> GetUserStats(string id, [FromQuery] string currentUserId)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            var cypher = @"
                MATCH (u:User {userId: toInteger($userId)})
                OPTIONAL MATCH (u)-[:POSTED]->(p:Post) WITH u, count(DISTINCT p) AS totalPosts
                OPTIONAL MATCH (u)-[:FRIEND]-(friend:User) WITH u, totalPosts, count(DISTINCT friend) AS friendCount
                OPTIONAL MATCH (follower:User)-[:FOLLOW]->(u) WITH u, totalPosts, friendCount, count(DISTINCT follower) AS followerCount
                OPTIONAL MATCH (u)-[:FOLLOW]->(following:User) WITH u, totalPosts, friendCount, followerCount, count(DISTINCT following) AS followingCount
                OPTIONAL MATCH (cu:User {userId: toInteger($currentUserId)})-[r:FOLLOW]->(u)
                RETURN totalPosts, friendCount, followerCount, followingCount, count(r) > 0 AS isFollowing";

            var currentId = string.IsNullOrEmpty(currentUserId) ? "0" : currentUserId;
            var result = await session.ExecuteReadAsync(async tx => {
                var cursor = await tx.RunAsync(cypher, new { userId = id, currentUserId = currentId });
                if (await cursor.FetchAsync())
                {
                    var record = cursor.Current;
                    return new { postCount = record["totalPosts"].As<long>(), friendCount = record["friendCount"].As<long>(), followerCount = record["followerCount"].As<long>(), followingCount = record["followingCount"].As<long>(), isFollowing = record["isFollowing"].As<bool>() };
                }
                return null;
            });
            if (result == null) return Ok(new { success = false, message = "Không thể thống kê" });
            return Ok(new { success = true, data = result });
        }

        public class UpdateUserRequest { public string fullName { get; set; } public string avatarUrl { get; set; } }

        // 5. CẬP NHẬT TRANG CÁ NHÂN
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateUser(string id, [FromBody] UpdateUserRequest request)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            var cypher = "MATCH (u:User {userId: toInteger($userId)}) SET u.name = $fullName, u.avatarUrl = $avatarUrl RETURN u.userId AS id, u.username AS username, u.name AS fullName, u.avatarUrl AS avatarUrl";
            var result = await session.ExecuteWriteAsync(async tx => {
                var cursor = await tx.RunAsync(cypher, new { userId = id, fullName = request.fullName, avatarUrl = request.avatarUrl });
                if (await cursor.FetchAsync())
                {
                    var record = cursor.Current;
                    return new { id = record["id"].As<object>()?.ToString() ?? "", username = record["username"].As<object>()?.ToString() ?? "", fullName = record["fullName"].As<object>()?.ToString() ?? "", avatarUrl = record["avatarUrl"].As<object>()?.ToString() ?? "" };
                }
                return null;
            });
            if (result == null) return BadRequest(new { success = false, message = "Lỗi khi cập nhật thông tin!" });
            return Ok(new { success = true, message = "Cập nhật thành công!", data = new { user = result } });
        }

        //=====================================
        // THEO DÕI / BỎ THEO DÕI
        //=====================================
        public class FollowActionDto { public string userId { get; set; } public string action { get; set; } }

        [HttpPost("{targetUserId}/follow")]
        public async Task<IActionResult> ToggleFollow(string targetUserId, [FromBody] FollowActionDto body)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            bool isFollow = body.action == "FOLLOW";

            var cypher = isFollow
                ? @"MATCH (u:User {userId: toInteger($userId)}), (target:User {userId: toInteger($targetId)}) MERGE (u)-[:FOLLOW]->(target)"
                : @"MATCH (u:User {userId: toInteger($userId)})-[r:FOLLOW]->(target:User {userId: toInteger($targetId)}) DELETE r";

            await session.ExecuteWriteAsync(async tx => await tx.RunAsync(cypher, new { userId = body.userId, targetId = targetUserId }));

            // Đếm lại số follower sau khi thao tác
            var countCypher = "MATCH (:User)-[r:FOLLOW]->(target:User {userId: toInteger($targetId)}) RETURN count(r) AS followerCount";
            var followerCount = await session.ExecuteReadAsync(async tx => {
                var res = await tx.RunAsync(countCypher, new { targetId = targetUserId });
                return (await res.SingleAsync())["followerCount"].As<long>();
            });

            return Ok(new { success = true, data = new { isFollowing = isFollow, followerCount = followerCount } });
        }
    }
}