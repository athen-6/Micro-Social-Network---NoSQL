using Microsoft.AspNetCore.Mvc;
using Neo4j.Driver;
using System.Linq;
using System.Threading.Tasks;
namespace MicroSocialNetwork.Controllers
{
    [ApiController]
    [Route("api/recommendations")]
    public class RecommendationsController : ControllerBase
    {
        private readonly IDriver _driver;

        public RecommendationsController(IDriver driver)
        {
            _driver = driver;
        }

        [HttpGet]
        public async Task<IActionResult> GetRecommendations([FromQuery] string userId)
        {
            if (string.IsNullOrEmpty(userId))
            {
                return BadRequest(new { success = false, message = "Thiếu thông tin người dùng." });
            }

            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));

            // Siêu truy vấn Cypher: Tìm những người là bạn của bạn bè, loại trừ những người đã là bạn
            var cypher = @"
                MATCH (me:User {userId: toInteger($userId)})-[:FRIEND]-(friend:User)-[:FRIEND]-(suggested:User) 
                WHERE me <> suggested AND NOT (me)-[:FRIEND]-(suggested) 
                RETURN suggested.userId AS id, 
                       suggested.username AS username, 
                       suggested.name AS fullName, 
                       suggested.avatarUrl AS avatarUrl, 
                       count(friend) AS mutualCount 
                ORDER BY mutualCount DESC 
                LIMIT 10";

            var recommendations = await session.ExecuteReadAsync(async tx =>
            {
                var result = await tx.RunAsync(cypher, new { userId });
                var records = await result.ToListAsync();

                return records.Select(r => new
                {
                    id = r["id"].As<long>().ToString(),
                    username = r["username"].As<string>(),
                    fullName = r["fullName"].As<string>(),
                    avatarUrl = r["avatarUrl"].As<object>()?.ToString() ?? "",

                    // C# tự động tạo ra chữ "Có X bạn chung" để đẩy lên giao diện
                    reason = $"Có {r["mutualCount"].As<long>()} bạn chung"
                }).ToList();
            });

            return Ok(new
            {
                success = true,
                message = "Lấy gợi ý thành công",
                data = new { recommendations = recommendations }
            });
        }
    }
}
