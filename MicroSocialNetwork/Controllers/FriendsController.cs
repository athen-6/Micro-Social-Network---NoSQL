using Microsoft.AspNetCore.Mvc;
using Neo4j.Driver;
using System.Linq;
using System.Threading.Tasks;

namespace MicroSocialNetwork.Controllers
{
    [ApiController]
    [Route("api/friends")]
    public class FriendsController : ControllerBase
    {
        private readonly IDriver _driver;

        public FriendsController(IDriver driver)
        {
            _driver = driver;
        }

        [HttpGet]
        public async Task<IActionResult> GetFriends([FromQuery] string userId, [FromQuery] string? type)
        {
            if (string.IsNullOrEmpty(userId)) return BadRequest(new { success = false, message = "Thiếu thông tin người dùng." });
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            string cypher = "";

            if (type == "following")
            {
                cypher = @"MATCH (u:User {userId: toInteger($userId)})-[:FOLLOW]->(f:User)
                           RETURN f.userId AS id, f.username AS username, f.name AS fullName, f.avatarUrl AS avatarUrl ORDER BY f.name";
            }
            else if (type == "followers")
            {
                cypher = @"MATCH (f:User)-[:FOLLOW]->(u:User {userId: toInteger($userId)})
                           RETURN f.userId AS id, f.username AS username, f.name AS fullName, f.avatarUrl AS avatarUrl ORDER BY f.name";
            }
            else
            {
                cypher = @"MATCH (u:User {userId: toInteger($userId)})-[:FRIEND]-(f:User)
                           RETURN f.userId AS id, f.username AS username, f.name AS fullName, f.avatarUrl AS avatarUrl ORDER BY f.name";
            }

            var friends = await session.ExecuteReadAsync(async tx =>
            {
                var result = await tx.RunAsync(cypher, new { userId });
                var records = await result.ToListAsync();
                return records.Select(r => new
                {
                    id = r["id"].As<long>().ToString(),
                    username = r["username"].As<string>(),
                    fullName = r["fullName"].As<string>(),
                    avatarUrl = r["avatarUrl"].As<object>()?.ToString() ?? ""
                }).ToList();
            });

            return Ok(new { success = true, data = new { friends = friends } });
        }

        //=======================================
        // HỦY BẠN BÈ
        //=======================================

        public class FriendActionDto { public string userId { get; set; } public string action { get; set; } }

        [HttpPost("{targetId}")]
        public async Task<IActionResult> ManageFriend(string targetId, [FromBody] FriendActionDto body)
        {
            if (body.action == "REMOVE")
            {
                await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
                var cypher = @"
            MATCH (u:User {userId: toInteger($userId)})-[r:FRIEND]-(f:User {userId: toInteger($targetId)})
            DELETE r";
                await session.ExecuteWriteAsync(async tx => await tx.RunAsync(cypher, new { userId = body.userId, targetId }));
            }
            return Ok(new { success = true, message = "Đã hủy kết bạn" });
        }
    }
}