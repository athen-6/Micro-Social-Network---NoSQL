using Microsoft.AspNetCore.Mvc;
using Neo4j.Driver;
using System.Linq;
using System.Threading.Tasks;

namespace MicroSocialNetwork.Controllers
{
    [ApiController]
    [Route("api/friend-requests")]
    public class FriendRequestsController : ControllerBase
    {
        private readonly IDriver _driver;

        public FriendRequestsController(IDriver driver)
        {
            _driver = driver;
        }

        [HttpGet]
        public async Task<IActionResult> GetFriendRequests([FromQuery] string userId)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            var cypher = @"
                MATCH (fromUser:User)-[r:REQUESTED]->(toUser:User {userId: toInteger($userId)})
                RETURN fromUser.userId AS fromId, fromUser.name AS fullName, fromUser.username AS username, fromUser.avatarUrl AS avatarUrl";

            var requests = await session.ExecuteReadAsync(async tx =>
            {
                var result = await tx.RunAsync(cypher, new { userId });
                var records = await result.ToListAsync();
                return records.Select(r => new
                {
                    id = r["fromId"].As<long>().ToString(),
                    fromUser = new
                    {
                        id = r["fromId"].As<long>().ToString(),
                        fullName = r["fullName"].As<string>(),
                        username = r["username"].As<string>(),
                        avatarUrl = r["avatarUrl"].As<object>()?.ToString() ?? ""
                    }
                }).ToList();
            });

            return Ok(new { success = true, data = new { requests = requests } });
        }

        public class SendRequestDto { public string userId { get; set; } }

        [HttpPost("{targetId}")]
        public async Task<IActionResult> SendRequest(string targetId, [FromBody] SendRequestDto body)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            var cypher = @"
                MATCH (u1:User {userId: toInteger($userId)}), (u2:User {userId: toInteger($targetId)})
                MERGE (u1)-[:REQUESTED]->(u2)";

            await session.ExecuteWriteAsync(async tx => await tx.RunAsync(cypher, new { userId = body.userId, targetId }));
            return Ok(new { success = true, message = "Đã gửi lời mời kết bạn" });
        }

        public class RespondDto { public string userId { get; set; } public string action { get; set; } }

        [HttpPost("{requestId}/respond")]
        public async Task<IActionResult> RespondRequest(string requestId, [FromBody] RespondDto body)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));
            string cypher = body.action == "ACCEPT"
                ? @"MATCH (fromUser:User {userId: toInteger($requestId)})-[r:REQUESTED]->(me:User {userId: toInteger($userId)}) DELETE r MERGE (fromUser)-[:FRIEND]-(me)"
                : @"MATCH (fromUser:User {userId: toInteger($requestId)})-[r:REQUESTED]->(me:User {userId: toInteger($userId)}) DELETE r";

            await session.ExecuteWriteAsync(async tx => await tx.RunAsync(cypher, new { requestId, userId = body.userId }));
            return Ok(new { success = true });
        }
    }
}