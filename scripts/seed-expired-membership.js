/**
 * Script para crear datos de prueba: empresa con membresía caducada.
 *
 * Uso:
 *   node scripts/seed-expired-membership.js
 *
 * Requiere: MONGODB env var o conecta a mongodb://localhost:27017/chekydb
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.MONGODB || 'mongodb://localhost:27017/chekydb';
const DB_NAME = 'chekydb';

async function seed() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('Conectado a MongoDB:', MONGO_URI);

  // ─── 1. EMPRESA ─────────────────────────────────────────────────────────────
  const companyId = '999';
  const existingCompany = await db.collection('companies').findOne({ id: companyId });
  if (!existingCompany) {
    await db.collection('companies').insertOne({
      id: companyId,
      name: 'EmpresaTestVencida',
      nit: '900111222-3',
      city: 'Bogotá',
      isActive: true,
    });
    console.log('✅ Empresa creada: EmpresaTestVencida (id: 999)');
  } else {
    console.log('ℹ️  Empresa ya existe (id: 999)');
  }

  // ─── 2. SEDE ────────────────────────────────────────────────────────────────
  const branchId = '999';
  const existingBranch = await db.collection('companybranches').findOne({ id: branchId });
  if (!existingBranch) {
    await db.collection('companybranches').insertOne({
      id: branchId,
      companyId: companyId,
      name: 'Principal',
      address: 'Cra 10 #20-30',
      city: 'Bogotá',
      isActive: true,
    });
    console.log('✅ Sede creada: Principal (id: 999)');
  } else {
    console.log('ℹ️  Sede ya existe (id: 999)');
  }

  // ─── 3. MEMBRESÍA CADUCADA ──────────────────────────────────────────────────
  const membershipId = '999';
  const existingMembership = await db.collection('memberships').findOne({ id: membershipId });
  if (!existingMembership) {
    await db.collection('memberships').insertOne({
      id: membershipId,
      companyId: companyId,
      planId: '1', // Plan Basic existente o el que tengas
      status: 'expired',
      startedAt: new Date('2026-04-01T00:00:00.000Z'),
      expiresAt: new Date('2026-05-01T00:00:00.000Z'),
      durationMonthsSnapshot: 1,
      maxUsersSnapshot: 25,
      maxBranchesSnapshot: 5,
      maxChecksPerMonthSnapshot: 150,
      maxChecksForPeriodSnapshot: 150,
      checksUsedInCurrentMonth: 150,
      currentMonthKey: '2026-04',
      checksUsedInPeriod: 150,
      checksTopupBonus: 0,
      deactivatedAt: new Date('2026-05-01T00:00:01.000Z'),
      deactivationReason: 'expired',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:01.000Z'),
    });
    console.log('✅ Membresía caducada creada (id: 999, expired 2026-05-01)');
  } else {
    console.log('ℹ️  Membresía ya existe (id: 999)');
  }

  // ─── 4. USUARIO ADMINISTRADOR ───────────────────────────────────────────────
  const adminEmail = 'admin.vencido@yopmail.com';
  const existingAdmin = await db.collection('users').findOne({ email: adminEmail });
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Test1234*', 10);
    await db.collection('users').insertOne({
      id: '998',
      email: adminEmail,
      document: '1234567890',
      password: hashedPassword,
      name: 'Admin',
      lastName: 'Vencido',
      roles: ['admin'],
      company: companyId,
      branchId: branchId,
      isActive: true,
    });
    console.log('✅ Usuario admin creado: admin.vencido@yopmail.com / Test1234*');
  } else {
    console.log('ℹ️  Usuario admin ya existe:', adminEmail);
  }

  // ─── 5. USUARIO ROL USER ───────────────────────────────────────────────────
  const userEmail = 'user.vencido@yopmail.com';
  const existingUser = await db.collection('users').findOne({ email: userEmail });
  if (!existingUser) {
    const hashedPassword = await bcrypt.hash('Test1234*', 10);
    await db.collection('users').insertOne({
      id: '999',
      email: userEmail,
      document: '0987654321',
      password: hashedPassword,
      name: 'Usuario',
      lastName: 'Vencido',
      roles: ['user'],
      company: companyId,
      branchId: branchId,
      isActive: true,
    });
    console.log('✅ Usuario user creado: user.vencido@yopmail.com / Test1234*');
  } else {
    console.log('ℹ️  Usuario user ya existe:', userEmail);
  }

  // ─── RESUMEN ────────────────────────────────────────────────────────────────
  console.log('\n─── Resumen ───');
  console.log('Empresa:    EmpresaTestVencida (id: 999)');
  console.log('Sede:       Principal (id: 999)');
  console.log('Membresía:  expired (2026-04-01 → 2026-05-01)');
  console.log('Admin:      admin.vencido@yopmail.com / Test1234*');
  console.log('User:       user.vencido@yopmail.com / Test1234*');
  console.log('\nListo ✅');

  await client.close();
}

seed().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
