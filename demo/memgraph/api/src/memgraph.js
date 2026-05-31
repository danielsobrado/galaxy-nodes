import neo4j from 'neo4j-driver';

const uri = process.env.MEMGRAPH_URI ?? 'bolt://localhost:7687';
const user = process.env.MEMGRAPH_USER ?? '';
const password = process.env.MEMGRAPH_PASSWORD ?? '';

const auth = user || password ? neo4j.auth.basic(user, password) : undefined;

export const driver = auth
  ? neo4j.driver(uri, auth, { disableLosslessIntegers: true })
  : neo4j.driver(uri, undefined, { disableLosslessIntegers: true });

export async function closeDriver() {
  await driver.close();
}

export async function waitForMemgraph(retries = 60) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const session = driver.session();
    try {
      await session.run('RETURN 1 AS ok');
      await session.close();
      return;
    } catch (error) {
      await session.close();
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
