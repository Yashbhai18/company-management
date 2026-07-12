import mongoose from 'mongoose';
import { connectDB } from './server/src/config/db';
import { getDashboardMetrics } from './server/src/services/dashboard.service';

async function run() {
  await connectDB();
  const orgId = '6a02d9806b830424cb2b9f70';
  const data = await getDashboardMetrics(orgId, -330);
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}
run().catch(console.error);
