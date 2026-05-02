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

		await env.FLASHCARDS_KV.put('hello', '{"hello": "world"}');

		await env.FLASHCARDS_KV.get('hello', 'json');

		// create deck -> AI model이 카드(Flashcard) 덱을 만듬
		// ex) "나는 영어를 배우고 싶으니간, 20개의 단어를 줘"  AI model이 data를 만들어 줌
		registerAppTool(
			server,
			'create-deck',
			{
				title: 'Create Deck',
				description:
					'이를 사용하여 스터디용 플래시 카드 덱을 만듭니다. 앞면(질문)과 뒷면(답변)에 힌트를 포함한 20장의 카드를 생성합니다. 이 도구를 사용하기 전에 사용자에게 사용자 이름을 물어보세요.',
				inputSchema: {
					usernaem: z.string().describe('사용자의 사용자 이름입니다. 도구를 사용하기 전에 이를 요청하세요.'),
					title: z.string().describe("덱의 제목: 예를 들어 '리액트 펀더멘털'"),
					description: z.string().describe('이 덱이 다루는 내용에 대한 간략한 설명'),
					cards: z
						.array(
							z.object({
								front: z.string().describe('질문 또는 프롬프트'),
								back: z.string().describe('정답'),
								hint: z.string().describe('카드에 대한 힌트'),
							}),
						)
						.min(10)
						.max(20)
						.describe('플래시 카드 배열 (20장 목표).'),
				},
				annotations: {
					readOnlyHint: false,
				},
				_meta: {
					ui: {
						resourceUri: WIDGET_URI,
					},
				},
			},
			async ({ title, description, cards, usernaem }) => {
				const cardsWithIds = cards.map((card, index) => ({
					id: `card-${Date.now()}-${index}`,
					status: 'now',
					...card,
				}));
				const deck = {
					id: `deck-${Date.now()}`,
					title,
					description,
					cards: cardsWithIds,
					createdAt: new Date().toISOString(),
				};

				const decksKey = `user:${usernaem}:decks`;

				// 카드뭉치 data를 FLASHARDS_KV에 저장
				await env.FLASHCARDS_KV.put(`user:${usernaem}:deck:${deck}`, JSON.stringify(deck));

				// usernaem을 사용해서 카드뭉치 조회
				const existingIds = await env.FLASHCARDS_KV.get<string[]>(decksKey, 'json');

				// 조회된 카드뭉치가 있다면 추가, 없다면 [] 예) `user:bingstar:decks` -> ['deck_1', 'deck_2', 'deck_3'] || 만약 없다면 빈 []
				const deckIds = existingIds || [];

				// 조회된 카드뭉치와 이전 카드뭉치를 deckIds에 묶음
				// push에 오류가 뜨는 이유는 existingIds를 알아보지 못하고 (unknown) deckIds를 빈 object로 취급해서임. 그래서 get<string[]>를 명시
				// 처음 접속할때는 데이터가 비어있는 상태이기 때문에 <string[]> 명시
				deckIds.push(deck.id);

				// 방금만든 카드뭉치 (decksKey)와, 새로 만든 뭉치가 추가된 (deckIds) 페어를 FLASHCARDS_KV에 추가
				await env.FLASHCARDS_KV.put(decksKey, JSON.stringify(deckIds));

				return {
					content: [
						{
							type: 'text',
							text: `${cards.length} 플래시카드로 ${title} 덱을 만들었습니다`,
						},
					],
					structuredContent: { deck, usernaem },
				};
			},
		);

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
