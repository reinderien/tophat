cd Source\Workspaces\ziptest\ziptest

$asms = "${env:ProgramFiles(x86)}\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.5.1"

&"${env:SystemRoot}\Microsoft.NET\Framework64\v4.0.30319\csc.exe" `
    /r:"$asms\System.IO.Compression.dll" `
    TopHat.cs
