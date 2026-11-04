// SORA-MINI-NEON-V1: Optional Windows native media metadata bridge.
// Reads only the Windows current media session; no network, microphone, files or screen capture.
using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Windows.Media.Control;

class Program {
    static async Task<int> Main(string[] args) {
        if (args.Length != 1 || args[0] != "status") return 2;
        try {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            var current = manager.GetCurrentSession() ?? manager.GetSessions().FirstOrDefault();
            if (current is null) {
                Console.WriteLine(JsonSerializer.Serialize(new {
                    available=true, playing=false, title="", artist="",
                    durationSeconds=0.0, positionSeconds=0.0
                }));
                return 0;
            }
            var props = await current.TryGetMediaPropertiesAsync();
            var info = current.GetPlaybackInfo();
            bool playing = info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            double durationSeconds = 0.0;
            double positionSeconds = 0.0;
            try {
                var timeline = current.GetTimelineProperties();
                if (timeline != null) {
                    durationSeconds = Math.Max(0.0, (timeline.EndTime - timeline.StartTime).TotalSeconds);
                    positionSeconds = Math.Max(0.0, (timeline.Position - timeline.StartTime).TotalSeconds);
                    if (durationSeconds > 0.0) positionSeconds = Math.Min(positionSeconds, durationSeconds);
                }
            } catch { /* Media source does not provide a timeline. */ }
            Console.WriteLine(JsonSerializer.Serialize(new {
                available=true, playing, title=props?.Title ?? "", artist=props?.Artist ?? "",
                app=current.SourceAppUserModelId ?? "", durationSeconds, positionSeconds
            }));
            return 0;
        } catch (Exception ex) {
            Console.Error.WriteLine(ex.Message);
            Console.WriteLine(JsonSerializer.Serialize(new {
                available=false, playing=false, title="", artist="",
                durationSeconds=0.0, positionSeconds=0.0
            }));
            return 1;
        }
    }
}
