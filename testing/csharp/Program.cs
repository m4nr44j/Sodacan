var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/api/dotnet", () => Results.Ok(new { ok = true }));

app.Run(); 