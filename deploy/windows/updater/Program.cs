// PlasticDB-Update.exe: runs the update script (embedded as a resource) in this console window as
// Administrator, then waits for a key so the final FINISHED / FAILED banner stays on screen.
// Built by deploy/windows/build-updater.ps1 with the csc.exe that ships with Windows.
//   PlasticDB-Update.exe             real update
//   PlasticDB-Update.exe --dry-run   shows what would happen, changes nothing
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;

static class Updater
{
    static int Main(string[] args)
    {
        try { Console.Title = "PlasticDB update"; } catch { }
        string script;
        using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("update.ps1"))
        using (var r = new StreamReader(s, Encoding.UTF8)) script = r.ReadToEnd();

        // a temporary copy of the script: PowerShell runs files, not text
        string tmp = Path.Combine(Path.GetTempPath(), "PlasticDB-update-" + Guid.NewGuid().ToString("N") + ".ps1");
        File.WriteAllText(tmp, script, new UTF8Encoding(true));

        var psi = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + tmp + "\"") { UseShellExecute = false };
        foreach (var a in args) if (a == "--dry-run") psi.EnvironmentVariables["PDB_DRYRUN"] = "1";

        int code = 1;
        try
        {
            using (var p = Process.Start(psi)) { p.WaitForExit(); code = p.ExitCode; }
        }
        catch (Exception e)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("Could not start PowerShell: " + e.Message);
            Console.ResetColor();
        }
        finally { try { File.Delete(tmp); } catch { } }

        Console.WriteLine();
        Console.WriteLine("Press any key to close this window.");
        try { Console.ReadKey(true); } catch { }
        return code;
    }
}
