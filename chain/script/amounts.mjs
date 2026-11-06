// Exact CLI arithmetic for uint256 chain balances. Never use shell integers or Number for amounts.
const UINT256_MAX = (1n << 256n) - 1n;
const uint256 = (value) => {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value))
    throw new Error("Expected a decimal uint256 amount");
  const parsed = BigInt(value);
  if (parsed > UINT256_MAX) throw new Error("Amount exceeds uint256");
  return parsed;
};

try {
  const [action, first, second, ...extra] = process.argv.slice(2);
  if (extra.length || !["enough", "delta"].includes(action))
    throw new Error("Usage: amounts.mjs enough BALANCE REQUIRED | delta BEFORE AFTER");
  const a = uint256(first);
  const b = uint256(second);
  if (action === "enough") process.exitCode = a >= b ? 0 : 1;
  else console.log((b - a).toString());
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
