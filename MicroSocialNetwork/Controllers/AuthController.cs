using Microsoft.AspNetCore.Mvc;
using Neo4j.Driver;
using MicroSocialNetwork.Models;
using System.Threading.Tasks;

namespace MicroSocialNetwork.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly IDriver _driver;

        public AuthController(IDriver driver)
        {
            _driver = driver;
        }

        public class LoginRequest
        {
            public string username { get; set; }
            public string password { get; set; }
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb")); var cypher = @"
        MATCH (u:User {username: $username})
        RETURN u.userId AS id, u.username AS username, u.name AS fullName, u.avatarUrl AS avatarUrl
        LIMIT 1";

            var result = await session.ExecuteReadAsync(async tx =>
            {
                var cursor = await tx.RunAsync(cypher, new { username = request.username });
                if (await cursor.FetchAsync())
                {
                    var record = cursor.Current;
                    return new
                    {
                        id = record["id"].As<object>()?.ToString() ?? "",
                        username = record["username"].As<object>()?.ToString() ?? "",
                        fullName = record["fullName"].As<object>()?.ToString() ?? "",
                        avatarUrl = record["avatarUrl"].As<object>()?.ToString() ?? ""
                    };
                }
                return null;
            });

            if (result == null)
            {
                return Ok(new
                {
                    success = false,
                    message = "Tên đăng nhập không tồn tại!"
                });
            }

            if (request.password != "123456")
            {
                return Ok(new
                {
                    success = false,
                    message = "Sai mật khẩu! (Gợi ý: hãy nhập 123456)"
                });
            }

            return Ok(new
            {
                success = true,
                message = "Đăng nhập thành công!",
                data = new { user = result }
            });
        }

        // ==========================================
        // API ĐĂNG KÝ TÀI KHOẢN MỚI
        // ==========================================

        public class RegisterRequest
        {
            public string username { get; set; }
            public string password { get; set; }
            public string fullName { get; set; }
            public string avatarUrl { get; set; }
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            await using var session = _driver.AsyncSession(o => o.WithDatabase("microsocialnetworkdb"));

            // 1. Kiểm tra xem username đã có người dùng chưa
            var checkCypher = "MATCH (u:User {username: $username}) RETURN u LIMIT 1";
            var exists = await session.ExecuteReadAsync(async tx =>
            {
                var cursor = await tx.RunAsync(checkCypher, new { username = request.username });
                return await cursor.FetchAsync();
            });

            if (exists)
            {
                return Ok(new { success = false, message = "Tên đăng nhập này đã có người sử dụng!" });
            }

            // 2. Tạo User mới
            long newUserId = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var defaultAvatar = string.IsNullOrEmpty(request.avatarUrl) ? "/Images/duyen.jpg" : request.avatarUrl;

            var createCypher = @"
                CREATE (u:User {
                    userId: $userId, 
                    username: $username, 
                    name: $fullName, 
                    avatarUrl: $avatarUrl,
                    password: $password 
                })
                RETURN u.userId AS id, u.username AS username, u.name AS fullName, u.avatarUrl AS avatarUrl";

            var result = await session.ExecuteWriteAsync(async tx =>
            {
                var cursor = await tx.RunAsync(createCypher, new
                {
                    userId = newUserId,
                    username = request.username,
                    fullName = request.fullName,
                    avatarUrl = defaultAvatar,
                    password = request.password
                });

                if (await cursor.FetchAsync())
                {
                    var record = cursor.Current;
                    return new
                    {
                        id = record["id"].As<object>()?.ToString() ?? "",
                        username = record["username"].As<object>()?.ToString() ?? "",
                        fullName = record["fullName"].As<object>()?.ToString() ?? "",
                        avatarUrl = record["avatarUrl"].As<object>()?.ToString() ?? ""
                    };
                }
                return null;
            });

            if (result == null)
            {
                return BadRequest(new { success = false, message = "Đã xảy ra lỗi khi tạo tài khoản vào cơ sở dữ liệu." });
            }

            return Ok(new
            {
                success = true,
                message = "Đăng ký thành công!",
                data = new { user = result }
            });
        }
    }
}