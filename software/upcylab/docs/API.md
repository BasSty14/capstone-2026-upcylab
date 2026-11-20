# API de registros

## Escritura

`POST /api/records` requiere `Content-Type: application/json` y `Authorization: Bearer <DEVICE_TOKEN>`.

```json
{"uid":"identificador-unico","type":"RESINA_LIQUIDA","grams":250,"measured_at":"2026-11-20T15:00:00Z"}
```

- `uid`: hasta 64 caracteres alfanuméricos, guion o guion bajo.
- `type`: `RESINA_LIQUIDA` o `SOLIDOS_EPIS`.
- `grams`: entero de 1 a 1000.
- `measured_at`: fecha UTC válida o `null` cuando no había reloj sincronizado.

La confirmación es `{"ok":true,"uid":"identificador-unico"}`. Repetir ID y datos confirma la fila existente sin duplicarla ni cambiar su recepción. Un ID con otros datos devuelve HTTP 409; falta de autorización, 401; datos inválidos, 400; base no disponible, 503.

## Lectura

- `GET /api/records`: últimas 200 filas, totales del filtro, hasta 14 días con registros y estado global en `status`, en una respuesta.
- `GET /api/export`: CSV de todas las filas del filtro.
- `GET /api/status`: disponibilidad y última recepción, para consultas independientes.

Filtros: `type`, `from` y `to`. Las fechas usan `YYYY-MM-DD` y corresponden a `America/Santiago`. El estado global conserva la última recepción aunque un filtro oculte todos los registros.

Cada fila distingue `measured_at` (medición), `received_at` (primera recepción) y `event_at` (medición o recepción si faltaba la primera). Se almacenan en UTC. La disponibilidad de la API no indica que el ESP32 esté conectado en ese momento.
