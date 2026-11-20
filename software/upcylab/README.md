# UPCYLAB · Dashboard y estación ESP32

Prototipo de registro de residuos para Lab881, Hub Providencia. El ESP32 envía registros por Wi-Fi a una API en Vercel, que los guarda en PostgreSQL (Neon). El dashboard muestra totales, gráficos, filtros y exportación CSV.

**Dashboard:** https://upcylab-dashboard.vercel.app

El peso se **simula con un potenciómetro** de 0 a 1000 g. Un LED representa el ciclo de resina líquida; no valida curado UV ni controla una lámpara real.

## Organización

```text
api/       Endpoints de registros, estado y exportación
public/    Dashboard en HTML, CSS y JavaScript
lib/       Validación, almacenamiento y respuestas HTTP
firmware/  Programa del ESP32 e instrucciones de conexión
scripts/   Desarrollo local, esquema y verificaciones
test/      Pruebas automatizadas
docs/      Configuración y contrato de la API
```

Esta carpeta puede incorporarse al repositorio de la bitácora como `software/upcylab/`. En Vercel se debe seleccionar esa carpeta como **Root Directory**.

## Desarrollo local

Requiere Node.js 22 actualizado y npm.

```sh
npm ci
npm test
npm run build
npm run dev
```

Abre http://127.0.0.1:8877. La base SQLite local en `data/` es independiente de producción. La vista de ejemplo vive solo en el navegador y no escribe registros.

## Despliegue y placa

1. Conecta Neon al proyecto Vercel y configura `DATABASE_URL` y `DEVICE_TOKEN` como variables privadas.
2. Inicializa la tabla con `npm run setup-db` usando una `.env.local` propia.
3. Configura `software/upcylab` como raíz de Vercel. Para desplegar por CLI desde el repo, sigue [estas instrucciones](docs/CONFIGURACION.md).
4. Configura y carga el [firmware](firmware/README.md) con la misma clave de escritura.

La API actual usa São Paulo (`gru1`), cerca de Neon. Consulta [configuración y despliegue](docs/CONFIGURACION.md) y el [contrato de la API](docs/API.md).

## Comportamiento

- El dashboard actualiza estado y registros juntos cada dos segundos mientras está visible.
- Los pendientes del ESP32 sobreviven a reinicios y sus IDs evitan duplicados.
- La placa conserva hasta 20 registros, sin sobrescribir pendientes.
- Los envíos exitosos son consecutivos; los fallos tienen esperas progresivas.
- Medición y recepción se conservan en UTC. El panel agrupa y filtra en hora de Chile.
- La lectura es pública y la escritura requiere `DEVICE_TOKEN`.

## Versionado y verificación

Se incluyen código, pruebas, certificados raíz públicos, `package-lock.json` y plantillas. Las credenciales reales, registros, dependencias, sesiones de Vercel y archivos generados se excluyen mediante `.gitignore`.

Ejecuta `npm test` y `npm run build` antes de desplegar. La prueba manual de producción se describe en [CONFIGURACION.md](docs/CONFIGURACION.md).

El uso y la licencia se rigen por lo acordado para el repositorio Capstone con el equipo y la contraparte.
