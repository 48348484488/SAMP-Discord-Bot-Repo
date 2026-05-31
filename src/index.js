import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.clone().text();

    const isValidRequest = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValidRequest) {
      return new Response('Bad request signature.', { status: 401 });
    }

    const interaction = JSON.parse(body);

    // Responde ao PING de verificação do Discord
    if (interaction.type === InteractionType.PING) {
      return Response.json({ type: InteractionResponseType.PONG });
    }

    // 1. Tratamento de Comandos de Barra (Slash Commands)
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = interaction.data;

      // Comando /compilar legado (caso alguém ainda use)
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

      // Novo comando /setup-ticket (Cria o painel de tickets)
      if (name === 'setup-ticket') {
        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: '🎫 Suporte & Compilação de APK',
                description: 'Precisa de ajuda ou quer compilar sua Source Code do SA-MP Mobile?\n\nClique no botão abaixo para abrir um canal de atendimento privado.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔒 Só você e a nossa equipe terão acesso ao canal\n⚡ Resposta rápida garantida\n🔨 Compilações de APK feitas automaticamente\n━━━━━━━━━━━━━━━━━━━━━━━━━━',
                color: 5814783, // Blurple/Azul bonito
              }
            ],
            components: [
              {
                type: 1, // Action Row
                components: [
                  {
                    type: 2, // Button
                    style: 1, // Primary (Blurple)
                    label: 'Abrir Ticket',
                    custom_id: 'abrir_ticket',
                    emoji: {
                      name: '🎫'
                    }
                  }
                ]
              }
            ]
          }
        });
      }
    }

    // 2. Tratamento de Cliques em Botões (Message Components)
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      const { custom_id } = interaction.data;

      // Clique em "Abrir Ticket"
      if (custom_id === 'abrir_ticket') {
        const guildId = interaction.guild_id;
        const userId = interaction.member.user.id;
        const username = interaction.member.user.username;

        if (!env.DISCORD_BOT_TOKEN) {
          return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: 64, // Ephemeral
              content: '❌ Erro interno: O segredo DISCORD_BOT_TOKEN não foi configurado.'
            }
          });
        }

        // Executamos a criação do canal em background para responder ao Discord antes do timeout de 3 segundos
        ctx.waitUntil((async () => {
          try {
            // Criação do Canal Privado via Discord REST API
            const createChannelRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
              method: 'POST',
              headers: {
                'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: `🎫-ticket-${username}`,
                type: 0, // Guild Text Channel
                permission_overwrites: [
                  {
                    id: guildId, // @everyone role
                    type: 0,
                    deny: '1024' // Deny VIEW_CHANNEL
                  },
                  {
                    id: userId, // O usuário que abriu
                    type: 1,
                    allow: '3072' // Allow VIEW_CHANNEL & SEND_MESSAGES
                  }
                ]
              })
            });

            if (!createChannelRes.ok) {
              throw new Error(`Discord API error: ${createChannelRes.statusText}`);
            }

            const newChannel = await createChannelRes.json();

            // Envia a mensagem com o botão "Compilar APK" dentro do novo canal de ticket
            await fetch(`https://discord.com/api/v10/channels/${newChannel.id}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                embeds: [
                  {
                    title: '🔨 Área de Compilação',
                    description: `Olá <@${userId}>!\n\nPronto para compilar a sua Source Code do SA-MP Mobile?\nClique no botão abaixo para preencher o formulário.`,
                    color: 3447003 // Azul escuro
                  }
                ],
                components: [
                  {
                    type: 1,
                    components: [
                      {
                        type: 2,
                        style: 1,
                        label: 'Compilar APK',
                        custom_id: 'compilar_apk',
                        emoji: {
                          name: '🔨'
                        }
                      }
                    ]
                  }
                ]
              })
            });

            // Envia a mensagem de confirmação final (webhook callback original)
            await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `✅ Seu ticket de compilação foi aberto com sucesso em <#${newChannel.id}>!`
              })
            });

          } catch (err) {
            console.error(err);
            // Atualiza a resposta inicial com o erro
            await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: '❌ Falha ao criar o canal do ticket. Por favor, verifique se o bot possui a permissão de "Gerenciar Canais" (Manage Channels) no servidor.'
              })
            });
          }
        })());

        // Responde de imediato ao Discord com uma mensagem pensando temporária (Deffered ephemeral)
        return Response.json({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: 64 // Ephemeral (só visível para quem clicou)
          }
        });
      }

      // Clique em "Compilar APK" dentro do Ticket
      if (custom_id === 'compilar_apk') {
        // Retorna o Modal pedindo a URL da source
        return Response.json({
          type: 9, // MODAL
          data: {
            title: 'Compilar Source Code',
            custom_id: 'modal_compilar',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4, // TEXT_INPUT
                    custom_id: 'zip_url_input',
                    label: 'Link direto ou do MediaFire (.zip)',
                    style: 1, // Short text/Single line
                    placeholder: 'https://www.mediafire.com/file/...',
                    required: true
                  }
                ]
              }
            ]
          }
        });
      }
    }

    // 3. Tratamento de Envios de Modal (Modal Submit)
    if (interaction.type === 5) {
      const { custom_id, components } = interaction.data;

      if (custom_id === 'modal_compilar') {
        // Encontra o valor digitado no input do modal
        const actionRow = components[0];
        const textInput = actionRow.components[0];
        const zipUrl = textInput.value;

        if (!zipUrl || (!zipUrl.startsWith('http://') && !zipUrl.startsWith('https://'))) {
          return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ URL inválida. O link fornecido deve iniciar com http:// ou https://.'
            }
          });
        }

        const githubUrl = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/actions/workflows/engine.yml/dispatches`;

        // Dispara o GitHub Actions em background
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
          }).then(async (res) => {
            if (!res.ok) {
              const errText = await res.text();
              console.error(`Erro ao disparar Action: ${errText}`);
            }
          }).catch(err => {
            console.error('Erro de rede ao disparar GitHub Actions', err);
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
