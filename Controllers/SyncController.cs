using Microsoft.AspNetCore.Mvc;
using System.Reflection;
using System.Text.Json;

namespace ModernWebsite.Controllers;

[Route("api/[controller]")]
public class SyncController(IConfiguration _config, ILogger<SyncController> _log) : Controller
{
    private static readonly object syncLock = new();

    private readonly string _dbFilePath = GetAbsoluteDbFilePath(_config["DbPath"]);

    private static string GetAbsoluteDbFilePath(string? dbPath)
    {
        var currentPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
        var expandedPath = Environment.ExpandEnvironmentVariables(dbPath ?? throw new ArgumentNullException(nameof(dbPath)));
        return Path.Combine(currentPath, expandedPath);
    }

    [HttpPost]
    public void UpdatePin([FromBody] Pin pin)
    {
        ArgumentNullException.ThrowIfNull(pin);
        if (pin.Id == Guid.Empty) throw new ArgumentException("Uninitialised Id", nameof(pin));
        if (pin.Owner == Guid.Empty) throw new ArgumentException("Uninitialised Owner", nameof(pin));
        if (pin.Latlng == null) throw new ArgumentException("Uninitialised LatLng", nameof(pin));

        _log.LogInformation("Updating pin {id}", pin.Id);

        lock (syncLock)
        {
            var pins = GetPinList().Result; // no async inside lock
            var idx = pins.FindIndex(p => p.Id == pin.Id);

            if (idx == -1 && pin.Show)
                pins.Add(pin);
            else if (idx >= 0 && pin.Show)
                pins[idx] = pin;
            else if (idx >= 0 && !pin.Show)
                pins.RemoveAt(idx);

            SetPinList(pins).Wait();
        }
    }

    [HttpGet]
    public List<Pin> GetPins()
    {
        lock (syncLock)
        {
            return GetPinList().Result; // no async inside lock
        }
    }

    // Calls to this must be protected by the syncLock.
    private async Task<List<Pin>> GetPinList()
    {
        try
        {
            using var stream = System.IO.File.Open(_dbFilePath, FileMode.OpenOrCreate);
            return await JsonSerializer.DeserializeAsync<List<Pin>>(stream) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    // Calls to this must be protected by the syncLock.
    private async Task SetPinList(List<Pin> pins)
    {
        await System.IO.File.WriteAllTextAsync(_dbFilePath, JsonSerializer.Serialize(pins));
    }
}

public record Pin(Guid Id, Guid Owner, LatLng Latlng, DateTimeOffset Updated, bool Show);

public record LatLng(double Lat, double Lng);
