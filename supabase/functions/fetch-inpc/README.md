# fetch-inpc — Edge Function

Trae los valores del INPC (Índice Nacional de Precios al Consumidor) directamente del Banco de Información Económica de INEGI y los deja en la tabla `inpc`.

## Setup inicial (una sola vez)

1. **Registrarse en INEGI** y obtener un token gratuito:
   https://www.inegi.org.mx/app/api/ → "Consulta de datos"

2. **Guardar el token como secreto** en Supabase (necesitas la CLI de Supabase instalada):
   ```bash
   supabase secrets set INEGI_TOKEN=<tu_token>
   ```

3. **Desplegar la función**:
   ```bash
   supabase functions deploy fetch-inpc
   ```

4. **Programar el cron** corriendo `supabase-inpc-cron.sql` en el SQL Editor (ver ese archivo para los pasos).

## Uso manual

Desde el cliente, botón "Sincronizar con INEGI" en `/fiscal/inpc`, o desde la CLI:

```bash
supabase functions invoke fetch-inpc --no-verify-jwt
```

## Respuesta

```json
{ "updated": 48, "latest": { "year": 2025, "month": 12, "valor": 143.77 } }
```

o error:

```json
{ "error": "Falta INEGI_TOKEN en secrets" }
```
