import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Seed admin user
  const hash = await bcrypt.hash('johndoe123', 10);
  await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      passwordHash: hash,
      fullName: 'Администратор',
      role: 'admin',
    },
  });

  // Seed clients
  const clientNames = [
    { name: 'ООО "ЛогистикПро"', contactPerson: 'Иванов А.С.', phone: '+7 (495) 123-45-67', email: 'info@logistikpro.ru', inn: '7701234567', address: 'г. Москва, ул. Логистическая, 15' },
    { name: 'АО "ТрансГрупп"', contactPerson: 'Петров В.И.', phone: '+7 (812) 234-56-78', email: 'order@transgrupp.ru', inn: '7802345678', address: 'г. Санкт-Петербург, пр. Невский, 100' },
    { name: 'ИП Сидоров К.М.', contactPerson: 'Сидоров К.М.', phone: '+7 (343) 345-67-89', email: 'sidorov@mail.ru', inn: '6603456789', address: 'г. Екатеринбург, ул. Малышева, 50' },
    { name: 'ООО "КарголайН"', contactPerson: 'Козлова Е.П.', phone: '+7 (383) 456-78-90', email: 'cargo@cargoline.ru', inn: '5404567890', address: 'г. Новосибирск, ул. Красный проспект, 25' },
    { name: 'ЗАО "Фрахт-Сервис"', contactPerson: 'Морозов Д.В.', phone: '+7 (861) 567-89-01', email: 'freight@fracht.ru', inn: '2305678901', address: 'г. Краснодар, ул. Красная, 77' },
  ];
  const clients: any[] = [];
  for (const c of clientNames) {
    const cl = await prisma.client.upsert({
      where: { id: c.inn },
      update: {},
      create: { id: c.inn, ...c },
    });
    clients.push(cl);
  }

  // Seed vehicles
  const vehicleData = [
    { plateNumber: 'А123БВ77', brand: 'КАМАЗ', model: '5490 Neo' },
    { plateNumber: 'В456ГД78', brand: 'Volvo', model: 'FH 460' },
    { plateNumber: 'Е789ЖЗ50', brand: 'MAN', model: 'TGX 18.440' },
    { plateNumber: 'И012КЛ23', brand: 'Scania', model: 'R450' },
    { plateNumber: 'М345НО66', brand: 'DAF', model: 'XF 480' },
    { plateNumber: 'П678РС77', brand: 'Mercedes', model: 'Actros 1845' },
    { plateNumber: 'Т901УФ78', brand: 'КАМАЗ', model: '54901' },
    { plateNumber: 'Х234ЦЧ50', brand: 'Volvo', model: 'FM 420' },
    { plateNumber: 'Ш567ЩЭ23', brand: 'Iveco', model: 'Stralis 460' },
    { plateNumber: 'Ю890ЯА66', brand: 'Scania', model: 'S500' },
  ];
  const vehicles: any[] = [];
  for (const v of vehicleData) {
    const vh = await prisma.vehicle.upsert({
      where: { id: v.plateNumber },
      update: {},
      create: { id: v.plateNumber, ...v, status: 'active' },
    });
    vehicles.push(vh);
  }

  // Seed drivers
  const driverData = [
    { fullName: 'Кузнецов Алексей Петрович', phone: '+7 (916) 111-22-33', licenseNumber: '77 АБ 123456' },
    { fullName: 'Новиков Сергей Иванович', phone: '+7 (926) 222-33-44', licenseNumber: '78 ВГ 234567' },
    { fullName: 'Волков Дмитрий Алексеевич', phone: '+7 (903) 333-44-55', licenseNumber: '50 ДЕ 345678' },
    { fullName: 'Соколов Андрей Викторович', phone: '+7 (915) 444-55-66', licenseNumber: '23 ЖЗ 456789' },
    { fullName: 'Лебедев Михаил Николаевич', phone: '+7 (905) 555-66-77', licenseNumber: '66 ИК 567890' },
    { fullName: 'Козлов Виктор Сергеевич', phone: '+7 (917) 666-77-88', licenseNumber: '77 ЛМ 678901' },
    { fullName: 'Степанов Николай Олегович', phone: '+7 (925) 777-88-99', licenseNumber: '78 НО 789012' },
    { fullName: 'Морозов Игорь Дмитриевич', phone: '+7 (909) 888-99-00', licenseNumber: '50 ПР 890123' },
  ];
  const drivers: any[] = [];
  for (let i = 0; i < driverData.length; i++) {
    const d = driverData[i];
    const dr = await prisma.driver.upsert({
      where: { id: `driver-${i}` },
      update: {},
      create: { id: `driver-${i}`, ...d, status: 'active' },
    });
    drivers.push(dr);
  }

  // Seed carriers
  const carrierData = [
    { name: 'ООО "Автолайн"', contactPerson: 'Белов Р.А.', phone: '+7 (495) 999-88-77', email: 'avto@autoline.ru', inn: '7712345678' },
    { name: 'ИП Громов А.В.', contactPerson: 'Громов А.В.', phone: '+7 (812) 888-77-66', email: 'gromov@mail.ru', inn: '7823456789' },
    { name: 'ООО "СпецТранс"', contactPerson: 'Орлов П.К.', phone: '+7 (343) 777-66-55', email: 'spec@spectrans.ru', inn: '6634567890' },
    { name: 'АО "ГрузоПеревозки"', contactPerson: 'Федоров С.Д.', phone: '+7 (383) 666-55-44', email: 'info@gruzo.ru', inn: '5445678901' },
  ];
  const carriers: any[] = [];
  for (const c of carrierData) {
    const cr = await prisma.carrier.upsert({
      where: { id: c.inn },
      update: {},
      create: { id: c.inn, ...c },
    });
    carriers.push(cr);
  }

  // Seed trips
  const routes = [
    ['Москва', 'Санкт-Петербург'], ['Москва', 'Краснодар'], ['Санкт-Петербург', 'Екатеринбург'],
    ['Новосибирск', 'Москва'], ['Екатеринбург', 'Казань'], ['Краснодар', 'Ростов-на-Дону'],
    ['Москва', 'Новосибирск'], ['Санкт-Петербург', 'Казань'],
  ];
  const statuses = ['new', 'in_progress', 'completed', 'paid'];

  for (let i = 0; i < 20; i++) {
    const tripId = `trip-${String(i + 1).padStart(3, '0')}`;
    const isOwn = i < 8;
    const route = routes[i % routes.length];
    const clientRate = 50000 + Math.floor(i * 5000);
    const status = statuses[i % 4];
    const tripDate = new Date(2026, 2, 1 + i); // March 2026
    const carrierRate = isOwn ? null : 30000 + Math.floor(i * 3000);
    const profit = isOwn ? clientRate - (5000 + i * 500) : clientRate - (carrierRate ?? 0);

    await prisma.trip.upsert({
      where: { id: tripId },
      update: {},
      create: {
        id: tripId,
        tripNumber: `TMS-2026-${String(i + 1).padStart(4, '0')}`,
        clientId: clients[i % clients.length].id,
        routeFrom: route[0],
        routeTo: route[1],
        tripType: isOwn ? 'own_transport' : 'expedition',
        clientRate,
        vehicleId: isOwn ? vehicles[i % vehicles.length].id : null,
        driverId: isOwn ? drivers[i % drivers.length].id : null,
        carrierId: isOwn ? null : carriers[(i - 8) % carriers.length].id,
        carrierRate,
        status,
        tripDate,
        profit,
      },
    });

    // Add expenses for own transport trips
    if (isOwn) {
      const expenseTypes = ['fuel', 'toll', 'ferry', 'other'];
      for (let j = 0; j < 2; j++) {
        await prisma.expense.upsert({
          where: { id: `exp-${tripId}-${j}` },
          update: {},
          create: {
            id: `exp-${tripId}-${j}`,
            tripId,
            expenseType: expenseTypes[j],
            amount: 2000 + j * 1000 + i * 250,
            description: j === 0 ? 'Заправка на трассе' : 'Платная дорога М11',
          },
        });
      }
    }
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
