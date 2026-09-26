# syntax=docker/dockerfile:1
# Build context is this folder:
#   docker build -t fittrack-api .
# ── Build stage ───────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Project file first for a layer-cached restore. The cache mount keeps NuGet packages across
# builds (BuildKit); publish needs it too because --no-restore reads from it.
COPY FitnessTracker.Api.csproj .
RUN --mount=type=cache,target=/root/.nuget/packages,sharing=locked dotnet restore FitnessTracker.Api.csproj

COPY . .
RUN --mount=type=cache,target=/root/.nuget/packages,sharing=locked dotnet publish FitnessTracker.Api.csproj --configuration Release --no-restore -p:UseAppHost=false --output /app/publish

# ── Runtime stage ─────────────────────────────────────────────────────────────
# chiseled-extra: non-root, no shell, with ICU + tzdata (per-user IANA time zones need it).
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra AS runtime
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_HTTP_PORTS=8080

# Workstation GC + conserve memory: a much smaller, steadier footprint on a small VPS.
ENV DOTNET_gcServer=0
ENV DOTNET_GCConserveMemory=5

EXPOSE 8080

ENTRYPOINT ["dotnet", "FitnessTracker.Api.dll"]
