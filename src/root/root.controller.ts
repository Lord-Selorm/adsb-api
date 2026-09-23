import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
export class RootController {
  @Get()
  index(): string {
    const base = '/api';
    const links = [
      ['Health / live feed status', `${base}/health`],
      ['Aircraft (ADS-B)', `${base}/aircraft`],
      ['Vessels (AIS)', `${base}/vessels`],
      ['Drones (Remote ID)', `${base}/rid/drones`],
      ['Remote ID live stats', `${base}/rid/stats`],
      ['Swagger / OpenAPI docs', `${base}/docs`],
      ['OpenAPI JSON', `${base}/docs-json`],
    ];
    const rows = links
      .map(
        ([name, path]) =>
          `<tr><td>${name}</td><td><a href="${path}">${path}</a></td></tr>`,
      )
      .join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ADS-B · RID · AIS — API</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:24px}
  h1{font-size:20px;margin:0 0 4px}
  p{color:#8b949e;margin:0 0 20px}
  a{color:#79c0ff;text-decoration:none}
  a:hover{text-decoration:underline}
  table{border-collapse:collapse;width:100%;max-width:720px}
  td,th{padding:8px 12px;text-align:left;border-bottom:1px solid #21262d;font-size:14px}
  th{color:#8b949e;font-weight:600}
  code{background:#21262d;padding:2px 6px;border-radius:4px;font-size:13px}
</style>
</head>
<body>
  <h1>ADS-B · Remote ID · AIS — Live API</h1>
  <p>Service is running. Explore the endpoints below.</p>
  <table>
    <thead><tr><th>Resource</th><th>Path</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  }
}