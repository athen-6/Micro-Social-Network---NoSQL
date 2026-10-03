using Neo4j.Driver;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Đọc cấu hình Neo4j từ appsettings.json
var neo4jConfig = builder.Configuration.GetSection("Neo4j");
var driver = GraphDatabase.Driver(
    neo4jConfig["Uri"],
    AuthTokens.Basic(neo4jConfig["Username"], neo4jConfig["Password"])
);

// Đăng ký Driver dạng Singleton
builder.Services.AddSingleton(driver);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Đăng ký kết nối Redis (mặc định localhost:6379)
builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
    ConnectionMultiplexer.Connect("localhost:6379"));

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAll");
app.UseHttpsRedirection();

// Cấu hình tự động đọc Frontend trong folder wwwroot
app.UseDefaultFiles(); // Mặc định tự bật index.html khi mở web
app.UseStaticFiles();  // Cho phép đọc CSS, JS, Ảnh trong wwwroot

app.UseAuthorization();
app.MapControllers();

app.Run();