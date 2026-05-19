export function getHealth() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  };
}
