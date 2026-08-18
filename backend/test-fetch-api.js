async function main() {
  const loginRes = await fetch('https://franco6869.alwaysdata.net/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ci: '0000001', password: 'admin123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.token;
  
  const attRes = await fetch('https://franco6869.alwaysdata.net/api/attendances?t=' + Date.now(), {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const attData = await attRes.json();
  console.log(JSON.stringify(attData.data.slice(0, 5), null, 2));
}

main().catch(console.error);
