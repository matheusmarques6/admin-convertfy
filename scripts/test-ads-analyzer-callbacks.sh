#!/usr/bin/env bash
#
# Smoke test dos 7 endpoints de callback do Analisador de ADS.
#
# Pré-requisitos:
#   1. .env.local com N8N_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY etc.
#   2. Dev server rodando: `npm run dev` (default http://localhost:3000)
#   3. STORE_ID válido (UUID de client_stores)
#
# Uso:
#   export N8N_WEBHOOK_SECRET="<mesmo valor do .env.local>"
#   export STORE_ID="3b02aea2-327a-476f-b10f-8d80167b4721"   # Salvini Labs AL
#   export BASE_URL="http://localhost:3000"                  # opcional
#   bash scripts/test-ads-analyzer-callbacks.sh
#
# Verifica cada endpoint imprimindo status HTTP. Espera 200 em todos.

set -uo pipefail

: "${N8N_WEBHOOK_SECRET:?Defina N8N_WEBHOOK_SECRET}"
: "${STORE_ID:?Defina STORE_ID (uuid de client_stores)}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
HDR=(-H "x-secret: ${N8N_WEBHOOK_SECRET}" -H "Content-Type: application/json")

pass=0
fail=0

call() {
  local label="$1"
  local path="$2"
  local body="$3"
  local expected="${4:-200}"

  local out
  out=$(curl -sS -o /tmp/resp.json -w "%{http_code}" -X POST "${BASE_URL}${path}" "${HDR[@]}" -d "$body")
  if [ "$out" = "$expected" ]; then
    echo "✓ ${label}  →  HTTP ${out}"
    pass=$((pass + 1))
  else
    echo "✗ ${label}  →  HTTP ${out} (esperado ${expected})"
    cat /tmp/resp.json
    echo
    fail=$((fail + 1))
  fi
}

echo "=== 1) /snapshot ==="
call "snapshot · happy path" "/api/webhooks/n8n/ads-analyzer/snapshot" "$(cat <<JSON
{
  "store_id": "${STORE_ID}",
  "snapshot_text": "Marca premium de skincare clean · foco em mulheres 28-45 com alta renda · diferencial em ingredientes naturais certificados"
}
JSON
)"

echo
echo "=== 2) /icp ==="
call "icp · happy path" "/api/webhooks/n8n/ads-analyzer/icp" "$(cat <<JSON
{
  "store_id": "${STORE_ID}",
  "persona": { "name": "Camila", "age": "34 anos", "city": "São Paulo · SP", "monogram": "CA" },
  "demographics": {
    "age_range": "28-45",
    "income": "R\$ 15k+/mês",
    "education": "Pós-graduação",
    "occupation": "Advogada",
    "religion": "Católica"
  },
  "day_in_life": "Acorda 6h, treina pilates antes do trabalho, almoça fora 3x/semana, faz skincare antes de dormir",
  "motivations": ["antienvelhecimento natural", "rotina simples", "produtos clean"],
  "frictions": ["medo de ingredientes desconhecidos", "rotinas longas demais", "preço muito alto sem justificativa"]
}
JSON
)"

echo
echo "=== 3) /tone ==="
call "tone · happy path" "/api/webhooks/n8n/ads-analyzer/tone" "$(cat <<JSON
{
  "store_id": "${STORE_ID}",
  "description": "Afetivo, próximo, com autoridade técnica leve. Usa frases curtas e prova social.",
  "do_phrases": ["Conta pra gente", "Sua pele vai amar"],
  "dont_phrases": ["Compre agora!!!", "Garanta já"],
  "use_words": ["natural", "ritual", "cuidado", "consciente"],
  "avoid_words": ["barato", "promoção", "explosivo"]
}
JSON
)"

echo
echo "=== 4) /ads-review ==="
call "ads-review · happy path" "/api/webhooks/n8n/ads-analyzer/ads-review" "$(cat <<JSON
{
  "store_id": "${STORE_ID}",
  "score": 7.5,
  "summary": "Operação funcional · diversificação baixa",
  "sub_scores": {
    "strategy": 7.0,
    "creatives": 8.0,
    "targeting": 7.5,
    "diversification": 5.0,
    "tracking": 8.5
  },
  "strengths": [
    {"what": "Criativos consistentes", "body": "Variantes seguem mesmo eixo visual, fortalecendo recall."},
    {"what": "Pixel + CAPI ativos", "body": "Tracking permite otimização efetiva pelo algoritmo."}
  ],
  "opportunities": [
    {"what": "Expandir Google Ads", "body": "Operação majoritariamente Meta — Google search captaria intenção alta."},
    {"what": "Testar lookalikes 1%", "body": "Base de compradores >5k permite LAL refinada."}
  ],
  "risks": [
    {"what": "Dependência Meta", "body": "Mudanças de política iOS já reduziram match rate; CAPI mitiga parcialmente."}
  ]
}
JSON
)"

echo
echo "=== 5) /products ==="
call "products · happy path" "/api/webhooks/n8n/ads-analyzer/products" "$(cat <<JSON
{
  "store_id": "${STORE_ID}",
  "captured_at": "2026-05-16T10:00:00Z",
  "products": [
    { "rank": 1, "title": "Sérum Vitamina C 30ml", "price": 189.90, "currency": "BRL", "handle": "serum-vitamina-c", "image_url": "https://cdn.example.com/p1.jpg" },
    { "rank": 2, "title": "Hidratante Facial Diurno 50ml", "price": 129.00, "currency": "BRL", "handle": "hidratante-diurno" },
    { "rank": 3, "title": "Protetor Solar FPS 60", "price": 159.00, "currency": "BRL", "handle": "protetor-fps60" },
    { "rank": 4, "title": "Tônico Adstringente 200ml", "price": 89.00, "currency": "BRL", "handle": "tonico-adstringente" },
    { "rank": 5, "title": "Kit Skincare Iniciante", "price": 299.00, "currency": "BRL", "handle": "kit-iniciante" }
  ]
}
JSON
)"

echo
echo "=== 5b) /products · idempotente (segunda chamada substitui) ==="
call "products · 2ª chamada" "/api/webhooks/n8n/ads-analyzer/products" "$(cat <<JSON
{
  "store_id": "${STORE_ID}",
  "products": [
    { "rank": 1, "title": "Sérum Vitamina C 30ml v2", "price": 199.90, "currency": "BRL" }
  ]
}
JSON
)"

echo
echo "=== 6) /competitors ==="
call "competitors · happy path" "/api/webhooks/n8n/ads-analyzer/competitors" "$(cat <<JSON
{
  "store_id": "${STORE_ID}",
  "competitors": [
    { "name": "Sallve", "url": "https://sallve.com.br", "posicionamento": "similar", "notas": "Concorrente direto · branding parecido" },
    { "name": "Simple Organic", "url": "https://simpleorganic.com.br", "posicionamento": "premium" }
  ]
}
JSON
)"

echo
echo "=== 6b) /competitors · idempotente (mesma URL não duplica) ==="
call "competitors · 2ª chamada" "/api/webhooks/n8n/ads-analyzer/competitors" "$(cat <<JSON
{
  "store_id": "${STORE_ID}",
  "competitors": [
    { "name": "Sallve (atualizado)", "url": "https://sallve.com.br", "posicionamento": "popular" }
  ]
}
JSON
)"

echo
echo "=== 7) /briefing-markdown ==="
call "briefing-markdown · happy path" "/api/webhooks/n8n/ads-analyzer/briefing-markdown" "$(cat <<JSON
{
  "store_id": "${STORE_ID}",
  "mode": "full",
  "generated_at": "2026-05-16T10:00:00Z",
  "raw_text": "# Briefing\n\n## Snapshot\nMarca premium de skincare clean.\n\n## ICP\nMulheres 28-45, alta renda.\n\n## Tom\nAfetivo e próximo.\n"
}
JSON
)"

echo
echo "=== AUTH · 401 esperado sem header ==="
out=$(curl -sS -o /tmp/resp.json -w "%{http_code}" -X POST "${BASE_URL}/api/webhooks/n8n/ads-analyzer/snapshot" \
  -H "Content-Type: application/json" \
  -d "{\"store_id\":\"${STORE_ID}\",\"snapshot_text\":\"x\"}")
if [ "$out" = "401" ]; then
  echo "✓ sem x-secret  →  HTTP 401"; pass=$((pass + 1))
else
  echo "✗ sem x-secret  →  HTTP ${out} (esperado 401)"; cat /tmp/resp.json; echo; fail=$((fail + 1))
fi

echo
echo "=== AUTH · 401 esperado com secret errado ==="
out=$(curl -sS -o /tmp/resp.json -w "%{http_code}" -X POST "${BASE_URL}/api/webhooks/n8n/ads-analyzer/snapshot" \
  -H "x-secret: wrong-value-here-1234567890" -H "Content-Type: application/json" \
  -d "{\"store_id\":\"${STORE_ID}\",\"snapshot_text\":\"x\"}")
if [ "$out" = "401" ]; then
  echo "✓ secret errado  →  HTTP 401"; pass=$((pass + 1))
else
  echo "✗ secret errado  →  HTTP ${out} (esperado 401)"; cat /tmp/resp.json; echo; fail=$((fail + 1))
fi

echo
echo "=== VALIDAÇÃO · 400 esperado com body inválido ==="
out=$(curl -sS -o /tmp/resp.json -w "%{http_code}" -X POST "${BASE_URL}/api/webhooks/n8n/ads-analyzer/snapshot" \
  "${HDR[@]}" -d '{"store_id":"not-a-uuid"}')
if [ "$out" = "400" ]; then
  echo "✓ body inválido  →  HTTP 400"; pass=$((pass + 1))
else
  echo "✗ body inválido  →  HTTP ${out} (esperado 400)"; cat /tmp/resp.json; echo; fail=$((fail + 1))
fi

echo
echo "=== NOT FOUND · 404 esperado com store_id inexistente ==="
out=$(curl -sS -o /tmp/resp.json -w "%{http_code}" -X POST "${BASE_URL}/api/webhooks/n8n/ads-analyzer/products" \
  "${HDR[@]}" -d '{"store_id":"00000000-0000-0000-0000-000000000000","products":[]}')
if [ "$out" = "404" ]; then
  echo "✓ store inexistente  →  HTTP 404"; pass=$((pass + 1))
else
  echo "✗ store inexistente  →  HTTP ${out} (esperado 404)"; cat /tmp/resp.json; echo; fail=$((fail + 1))
fi

echo
echo "==============================================="
echo "Resultado:  ${pass} passou(aram) · ${fail} falhou(aram)"
echo "==============================================="

if [ "$fail" -gt 0 ]; then exit 1; fi
