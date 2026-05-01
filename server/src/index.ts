import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import z from 'zod';

const WIDGET_URI = 'ui://flashcards-widget';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const server = new McpServer({
			name: 'Flashcard Server',
			version: '1.0.0',
		});

		registerAppResource(server, 'Flashcard Widget', WIDGET_URI, { description: 'Flashcard widget' }, async () => {
			const html = await env.ASSETS.fetch(new URL('http://hello/index.html'));
			return {
				contents: [
					{
						uri: WIDGET_URI,
						text: await html.text(),
						mimeType: RESOURCE_MIME_TYPE,
						_meta: {
							ui: {
								csp: {
									connectDomains: ['https://*.workers.dev'],
									resourceDomains: [
										'https://*.workers.dev',
										'https://fonts.googleapis.com',
										'https://fonts.gstatic.com',
										'https://image.tmdb.org',
									],
								},
							},
						},
					},
				],
			};
		});

		await env.FLASHCARDS_KV.put('hello', 'world');

		// create deck -> AI model이 카드(Flashcard) 덱을 만듬
		// ex) "나는 영어를 배우고 싶으니간, 20개의 단어를 줘"  AI model이 data를 만들어 줌

		// list decks -> 카드 리스트가 있다면 모두 볼 수 있게 해주는 tool

		// open deck -> 선택한 카드 뭉치의 모든 카드를 가져옴

		// mark card (private) -> (AI model 호출 X, 유저 클릭으로 호출) 단어의 암기상태 즉 유저가 단어 공부를 하다 특정 단어를 마스터 했다면 완벽히 숙달하고 기억, 그걸 유저가 볼 수 있게 표시 해줌 (몇개의 단어를 마스터했는지 또는 하지 못했는지 표시)

		// reset deck (private) -> (AI model 호출 X, 유저 클릭으로 호출) 처음부터 공부를 다시 시작하고 싶을 수도 있으니 초기화 해줌

		// delete deck -> 카드 뭉치 삭제

		// @ts-ignore
		const handler = createMcpHandler(server);

		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
