# Scripts de Seed — Cheky API

Scripts utilitarios para crear datos de prueba en la base de datos MongoDB (chekydb).

---

## seed-expired-membership.js

Crea una empresa de prueba con membresía caducada y sus usuarios asociados para validar el comportamiento de la plataforma cuando una suscripción ha expirado.

### Datos que crea

| Entidad | Nombre | ID | Detalle |
|---------|--------|----|---------|
| Empresa | EmpresaTestVencida | 999 | NIT: 900111222-3, Bogotá, activa |
| Sede | Principal | 999 | Cra 10 #20-30, Bogotá |
| Membresía | — | 999 | Plan Basic, expired 2026-05-01, 150/150 checks usados |
| Admin | Admin Vencido | 998 | admin.vencido@yopmail.com |
| Usuario | Usuario Vencido | 999 | user.vencido@yopmail.com |

### Credenciales de prueba

| Rol | Email | Password |
|-----|-------|----------|
| Administrador | `admin.vencido@yopmail.com` | `Test1234*` |
| Usuario | `user.vencido@yopmail.com` | `Test1234*` |

### Requisitos previos

- Node.js 20+
- Acceso a la base de datos MongoDB (local o remota)
- Paquete `mongodb` instalado globalmente o en el proyecto
- Paquete `bcrypt` disponible (ya es dependencia del proyecto)

### Ejecución

#### Base de datos local

```bash
cd NestJS-CRUD
node scripts/seed-expired-membership.js
```

Por defecto conecta a `mongodb://localhost:27017/chekydb`.

#### Base de datos remota (producción / staging)

```bash
MONGODB="mongodb+srv://usuario:password@cluster.mongodb.net/chekydb" node scripts/seed-expired-membership.js
```

Reemplaza la URI con tu string de conexión real. Puedes encontrarla en el `.env` del proyecto como variable `MONGODB`.

#### Usando la variable del .env del proyecto

```bash
# Cargar las variables del .env y ejecutar
source .env 2>/dev/null; node scripts/seed-expired-membership.js
```

En Windows (PowerShell):
```powershell
$env:MONGODB = (Get-Content .env | Select-String "^MONGODB=").ToString().Split("=",2)[1]
node scripts/seed-expired-membership.js
```

### Idempotencia

El script es **idempotente**: si los registros ya existen (verificados por `id` o `email`), no los duplica. Puedes ejecutarlo múltiples veces sin riesgo.

### Verificación

Después de ejecutar, verifica los datos:

```bash
# Verificar empresa
mongosh chekydb --eval "db.companies.findOne({id: '999'})"

# Verificar sede
mongosh chekydb --eval "db.companybranches.findOne({id: '999'})"

# Verificar membresía
mongosh chekydb --eval "db.memberships.findOne({id: '999'})"

# Verificar usuarios
mongosh chekydb --eval "db.users.find({company: '999'}).toArray()"
```

### Pruebas esperadas

Una vez creados los datos, al iniciar sesión con los usuarios de prueba:

| Escenario | Login | Resultado esperado |
|-----------|-------|--------------------|
| Admin con membresía vencida | `admin.vencido@yopmail.com` | Dashboard muestra plan expirado, botones de Aumentar checks deshabilitados |
| User con membresía vencida | `user.vencido@yopmail.com` | No puede realizar checks (mensaje de error de membresía) |

### Limpieza

Para eliminar los datos de prueba:

```bash
mongosh chekydb --eval "
  db.companies.deleteOne({id: '999'});
  db.companybranches.deleteOne({id: '999'});
  db.memberships.deleteOne({id: '999'});
  db.users.deleteMany({company: '999'});
  print('Datos de prueba eliminados');
"
```

---

## Notas generales

- Todos los IDs en Cheky son strings numéricos incrementales (no ObjectId de MongoDB).
- Los passwords se hashean con bcrypt (10 rounds).
- Las relaciones entre entidades usan el campo `id` string (no `_id`).
- Los roles válidos son: `superAdmin`, `admin`, `user`.
- Los estados de membresía son: `active`, `expired`, `suspended`, `cancelled`.
