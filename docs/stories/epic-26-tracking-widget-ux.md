# Epic 26 — Tracking Widget UX: Traducao + Detalhes do Pedido

## Contexto

O widget de tracking ja funciona e exibe dados corretamente, mas dois problemas de UX impactam a experiencia do consumidor final:

1. **Traducao incompleta**: Alguns eventos chegam em ingles apesar da pagina estar marcada como `pt-BR`. Alem disso, strings do widget tem acentos faltando.
2. **Sem detalhes do pedido**: O widget mostra apenas tracking/timeline, sem imagem do produto, nome, quantidade ou preco — dados que ja existem no banco.

## Stories

| Story | Titulo | Prioridade | Esforco |
|-------|--------|------------|---------|
| 26.1 | Fix acentos e typos no widget JS | Alta | P |
| 26.2 | Corrigir pipeline de dados (image_url + line_items) | Alta | P |
| 26.3 | Renderizar detalhes do pedido no widget | Alta | M |
| 26.4 | Expandir traducoes + fallback regex | Media | M |

## Ordem de Execucao

```
26.1 (bug fix trivial)
  |
26.2 (pipeline de dados)
  |
26.3 (renderizacao no widget) — depende de 26.2
  |
26.4 (traducao expandida) — independente, pode ser paralelo com 26.3
```

## Decisoes Arquiteturais

- **Imagens**: usar CDN Shopify direto (sem proxy), com `?width=96` para thumbnails otimizados
- **Traducao**: expandir dicionario estatico + fallback regex word-level (sem API externa)
- **Widget**: vanilla JS (sem framework), Shadow DOM, CSS isolado
- **Responsividade**: thumbnails 64px desktop, 48px mobile (<360px)
- **Fallback**: placeholder icon quando `image_url` e null, esconder secao quando `line_items` vazio
