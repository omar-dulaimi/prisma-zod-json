// SPIKE: exactly the file a prisma-json-types-generator user already has.
declare global {
  namespace PrismaJson {
    interface Prefs {
      theme: 'light' | 'dark';
      digestHour?: number;
      tags: string[];
    }
  }
}
export {};
