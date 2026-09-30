# Ícones GCC

15 ícones vetoriais originais para o menu apresentado. Grade 24×24, traço 1,7, extremidades arredondadas e fundo transparente.

- svg/: cor adaptável via currentColor; inserir SVG inline ou usar sprite.svg.
- svg-claro/: cor clara fixa para uso com img em fundo escuro.
- svg-escuro/: cor escura fixa para uso com img em fundo claro.
- preview.html: catálogo visual local, sem dependências externas.
- sprite.svg: símbolos reutilizáveis.
- manifest.json: nomes e correspondência das áreas.

SVG carregado via img não herda a cor CSS da página: use a variante de cor fixa. Recomendação de tamanho: 20 ou 24 px; use 24 px nos ícones mais detalhados.

Exemplo inline com sprite (servido no mesmo site):

`<svg width="24" height="24" aria-hidden="true"><use href="assets/icons/sprite.svg#dashboard"/></svg>`

Quando houver texto ao lado, o ícone é decorativo: use aria-hidden="true" no SVG ou alt="" na imagem.

Uso e edição livres no GCC. Nenhum arquivo da aplicação foi substituído.
