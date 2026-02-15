export async function startGame() {
  const res = await fetch("http://localhost:5000/api/start-game");
  if (!res.ok) throw new Error("Failed to start game");
  return res.json();
}