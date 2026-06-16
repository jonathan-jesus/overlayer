# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 – build
#   Uses the full .NET 10 SDK to restore dependencies and publish a Release
#   binary. The whole src/backend tree is copied so the ProjectReference to
#   Overlayer.Shared resolves correctly without needing the solution file.
# ──────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src

# Copy project files first so the restore layer is cached independently of
# source changes.
COPY src/backend/Overlayer.Shared/Overlayer.Shared.csproj   src/backend/Overlayer.Shared/
COPY src/backend/Overlayer.Worker/Overlayer.Worker.csproj   src/backend/Overlayer.Worker/

RUN dotnet restore src/backend/Overlayer.Worker/Overlayer.Worker.csproj

# Copy source and publish.
COPY src/backend/Overlayer.Shared/   src/backend/Overlayer.Shared/
COPY src/backend/Overlayer.Worker/   src/backend/Overlayer.Worker/

RUN dotnet publish src/backend/Overlayer.Worker/Overlayer.Worker.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 – runtime
#   Lean Debian-slim image that already carries the .NET 10 runtime.
#   FFmpeg binary is copied from the build stage; no apt packages are needed.
# ──────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/runtime:10.0 AS runtime

COPY --from=mwader/static-ffmpeg:8.1.1 /ffmpeg /usr/local/bin/ffmpeg
COPY --from=mwader/static-ffmpeg:8.1.1 /ffprobe /usr/local/bin/ffprobe

ENV DOTNET_ENVIRONMENT=Production

WORKDIR /app
COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "Overlayer.Worker.dll"]
