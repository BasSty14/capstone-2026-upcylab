# Configuración y despliegue

1. Crea o importa el proyecto en Vercel. Si está dentro de la bitácora, selecciona `software/upcylab` como **Root Directory**.
2. Conecta Neon desde Storage/Marketplace. Conserva `DATABASE_URL` solo en el servidor.
3. Genera una clave de escritura con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guárdala en `DEVICE_TOKEN` de Vercel y en `config.h` del ESP32, nunca en el JavaScript público.
4. Copia `.env.example` a `.env.local` y completa tus valores privados.

```sh
npm ci
npm run setup-db
npm test
npm run build
npx vercel login
```

`setup-db` crea tabla e índice si faltan; no borra registros. La sesión de Vercel no forma parte del repositorio. La API está configurada en São Paulo (`gru1`), próxima a la base actual.

En este repositorio, ejecuta los comandos de despliegue **desde la raíz de la bitácora**, indicando la configuración del subproyecto:

```sh
npx vercel link --project upcylab-dashboard
npx vercel deploy --prod --local-config software/upcylab/vercel.json
```

En Vercel, `Root Directory` debe ser `software/upcylab` y la rama de producción, `main`. La publicación automática requiere que la app de Vercel en GitHub tenga acceso al repositorio; vincular la cuenta de GitHub al inicio de sesión no sustituye esa instalación.

## Pruebas

`npm test` usa bases temporales locales. `npm run build` revisa sintaxis y configuración.

Para una prueba manual contra un despliegue real, configura `DASHBOARD_URL`, `DATABASE_URL` y `DEVICE_TOKEN` en tu `.env.local` y ejecuta:

```sh
node --env-file=.env.local scripts/smoke.mjs
```

La prueba valida autenticación, escritura, reintentos, conflictos, lectura y CSV. Crea un ID temporal y elimina solo ese ID al terminar. No se ejecuta automáticamente con `npm test`.

## Desarrollo local

`npm run dev` usa SQLite en `data/preview.sqlite3`, separado de Neon. Puede iniciarse sin cuenta de Vercel ni conexión a Internet después de instalar dependencias. Configura `DEVICE_TOKEN` en `.env.local` para probar escrituras; si falta, genera una clave temporal que no publica.

## Archivos privados y acceso

No versionar `.env*` reales, `firmware/sketch/config.h`, `.vercel/`, `node_modules/`, `data/`, respaldos, registros, capturas de pruebas ni binarios. Solo se incluyen `.env.example` y `config.example.h` como plantillas.

El panel y la API de lectura son públicos para la presentación; la clave protege la escritura. Peticiones y almacenamiento están sujetos a las cuotas de Vercel y Neon.
