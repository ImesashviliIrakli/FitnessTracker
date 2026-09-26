using FitnessTracker.Api.Common;
using FitnessTracker.Api.Data;
using FluentValidation;
using Microsoft.AspNetCore.Identity;

namespace FitnessTracker.Api.Features;

public sealed record RegisterRequest(string Email, string Password, string DisplayName);
public sealed record LoginRequest(string Email, string Password, bool RememberMe);
public sealed record Me(Guid Id, string Email, string DisplayName, bool ProfileComplete, UnitSystem UnitSystem);

public sealed class RegisterValidator : AbstractValidator<RegisterRequest>
{
    public RegisterValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(254);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128); // strength rules come from Identity options
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(60);
    }
}

public sealed class LoginValidator : AbstractValidator<LoginRequest>
{
    public LoginValidator()
    {
        RuleFor(x => x.Email).NotEmpty().MaximumLength(254);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128);
    }
}

public static class AuthEndpoints
{
    public static Me ToMe(this AppUser u) => new(u.Id, u.Email!, u.DisplayName, u.ProfileComplete, u.UnitSystem);

    public static void MapAuth(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth");

        g.MapPost("/register", async (RegisterRequest req, UserManager<AppUser> users, SignInManager<AppUser> signIn, TimeProvider clock) =>
        {
            var user = new AppUser
            {
                Id = Guid.CreateVersion7(),
                UserName = req.Email.Trim(),
                Email = req.Email.Trim(),
                DisplayName = req.DisplayName.Trim(),
                CreatedAt = clock.GetUtcNow().UtcDateTime,
            };
            var result = await users.CreateAsync(user, req.Password);
            if (!result.Succeeded)
            {
                var errors = result.Errors
                    .GroupBy(e => e.Code.Contains("Password") ? "password" : "email")
                    .ToDictionary(x => x.Key, x => x.Select(e => e.Description).ToArray());
                return Results.ValidationProblem(errors);
            }
            await signIn.SignInAsync(user, isPersistent: true);
            return Results.Ok(user.ToMe());
        }).Validate<RegisterRequest>().RequireRateLimiting("auth");

        g.MapPost("/login", async (LoginRequest req, UserManager<AppUser> users, SignInManager<AppUser> signIn) =>
        {
            var result = await signIn.PasswordSignInAsync(req.Email.Trim(), req.Password, req.RememberMe, lockoutOnFailure: true);
            if (result.IsLockedOut)
                return Results.Problem(statusCode: 429, title: "Too many failed attempts. Try again in 15 minutes.");
            if (!result.Succeeded)
                return Results.Problem(statusCode: 401, title: "Incorrect email or password.");
            var user = await users.FindByNameAsync(req.Email.Trim());
            return Results.Ok(user!.ToMe());
        }).Validate<LoginRequest>().RequireRateLimiting("auth");

        g.MapPost("/logout", async (SignInManager<AppUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        });

        g.MapGet("/me", async (AppDbContext db, HttpContext ctx, CancellationToken ct) =>
            Results.Ok((await db.CurrentUserAsync(ctx.User, ct)).ToMe())).RequireAuthorization();
    }
}
