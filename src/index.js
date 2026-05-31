import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.clone().text();

    // ✅ CORRIGIDO: verifyKey é async, precisa de await
    const isValidRequest = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValidRequest) {
      return new Response('Bad request signature.', { status: 401 });
    }

    const interaction = JSON.parse(body);

    // Responde ao PING de verificação do Discord
    if (interaction.type === InteractionType.PING) {
      return Response.json({ type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = interaction.data;

      if (name === 'compilar') {
        const urlOption = options && options.find(opt => opt.name === 'url');
        const zipUrl = urlOption ? urlOption.value : null;

        if (!zipUrl || (!zipUrl.startsWith('http://') && !zipUrl.startsWith('https://'))) {
          return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ URL inválida. Forneça uma URL que comece com http ou https.' }
          });
        }

        const githubUrl = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/actions/workflows/engine.yml/dispatches`;

        // Dispara a Action do Github em background
        ctx.waitUntil(
          fetch(githubUrl, {
            method: 'POST',
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Cloudflare-Worker'
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: {
                zip_url: zipUrl.trim(),
                channel_id: interaction.channel_id
              }
            })
          })
        );

        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `💻 **COMPILAÇÃO INICIADA!**\n\n📡 Conectando aos servidores do GitHub...\n🔗 **Source Code:** ${zipUrl}\n\n_Quando a compilação terminar (em média 15 a 40 minutos), enviarei o link do APK final aqui mesmo neste canal!_`
          }
        });
      }
    }

    return new Response('Unknown Type', { status: 400 });
  }
};
