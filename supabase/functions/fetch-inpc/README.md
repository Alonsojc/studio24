# fetch-inpc — Edge Function

Trae los valores del INPC (Índice Nacional de Precios al Consumidor) desde la API SIE de Banxico y los deja en la tabla `inpc`.

Usa Banxico en lugar de INEGI porque su API es más simple y estable (sin áreas geográficas, fuentes BIE/BISE, etc.). El INPC que publica Banxico es el mismo dato oficial que INEGI.

## Setup inicial (una sola vez)

1. **Registrarse en Banxico** y obtener un token gratuito:
   https://www.banxico.org.mx/SieAPIRest/service/v1/token

2. **Guardar el token como secreto** en Supabase (vía CLI):
   ```bash
   supabase secrets set BANXICO_TOKEN=<tu_token>
   ```

3. **Desplegar la función**:
   ```bash
   supabase functions deploy fetch-inpc --no-verify-jwt
   ```

4. **Programar el cron** (opcional) corriendo `supabase-inpc-cron.sql` en el SQL Editor.

## Uso manual

Desde el cliente, botón "Sincronizar" en `/fiscal/inpc`. O vía CLI:

```bash
supabase functions invoke fetch-inpc
```

## Respuesta

Éxito:
```json
{ "updated": 48, "latest": { "year": 2025, "month": 12, "valor": 143.77 } }
```

Error (ejemplos):
```json
{ "error": "Falta BANXICO_TOKEN en secrets" }
{ "error": "Banxico respondió 401", "body": "..." }
```

## Serie usada

- **SP74665** — INPC General Mensual (Base 2018=100).

Si el contador necesita otra serie (quincenal, subyacente, no subyacente, etc.) cambia la constante `BANXICO_SERIE` en `index.ts`.
