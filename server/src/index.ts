import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import z from 'zod';

const WIDGET_URI = 'ui://flashcards-widget';

const cardSchema = z.object({
	id: z.string().readonly(),
	front: z.string().describe('질문 또는 프롬프트'),
	back: z.string().describe('정답'),
	hint: z.string().describe('카드에 대한 힌트'),
	status: z.enum(['new', 'learning', 'mastered']).readonly().default('new'),
});

const deckSchema = z.object({
	title: z.string().describe("덱의 제목: 예를 들어 '리액트 펀더멘털'"),
	description: z.string().describe('이 덱이 다루는 내용에 대한 간략한 설명'),
	cards: z.array(cardSchema).min(10).max(20).describe('플래시 카드 배열 (20장 목표).'),
});

type Deck = z.infer<typeof deckSchema>;
type Card = z.infer<typeof cardSchema>;

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
					username: z.string().describe('사용자의 사용자 이름입니다. 도구를 사용하기 전에 이를 요청하세요.'),
					deck: deckSchema,
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
			async ({ deck: { title, description, cards }, username }) => {
				const cardsWithIds = cards.map((card, index) => ({
					...card,
					id: `card-${Date.now()}-${index}`,
					status: 'new',
				}));
				const deck = {
					id: `deck-${Date.now()}`,
					title,
					description,
					cards: cardsWithIds,
					createdAt: new Date().toISOString(),
				};

				const decksKey = `user:${username}:decks`;

				// 카드뭉치 data를 FLASHARDS_KV에 저장
				await env.FLASHCARDS_KV.put(`user:${username}:deck:${deck.id}`, JSON.stringify(deck));

				// username을 사용해서 카드뭉치 조회
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
					structuredContent: { deck, username },
				};
			},
		);

		// userId list decks -> userId로 조회 한 후 카드 리스트가 있다면 모두 볼 수 있게 해주는 tool
		registerAppTool(
			server,
			'list-deck',
			{
				title: 'List Deck',
				description:
					'이를 사용하여 사용자에게 덱 목록을 보여줍니다. 모르는 경우 이 도구를 사용하기 전에 사용자에게 사용자 이름을 물어보세요.',
				inputSchema: {
					username: z.string().describe('사용자의 사용자 이름입니다. 도구를 사용하기 전에 이를 요청하세요.'),
				},
				annotations: {
					readOnlyHint: true,
				},
				_meta: {
					ui: {
						resourceUri: WIDGET_URI,
					},
				},
			},
			async ({ username }) => {
				// username을 사용해서 key를 생성
				const decksKey = `user:${username}:decks`;

				// 생성된 key를 통해 보유중인 모든 deck ID를 조회
				const deckIds = await env.FLASHCARDS_KV.get<string[]>(decksKey, 'json');

				// 보유중인 deck이 없음
				if (!deckIds || deckIds.length === 0) {
					return {
						content: [{ text: `${username}는 카드뭉치가 없습니다.`, type: 'text' }],
						structuredContent: { decks: [] },
					};
				}

				// push에 오류가 뜨는 이유는 existingIds를 알아보지 못하고 (unknown) deckIds를 빈 object로 취급해서임. 그래서 get<string[]>를 명시
				// 처음 접속할때는 데이터가 비어있는 상태이기 때문에 <string[]> 명시
				// 유저가 가진 deck의 ID를 찾았다면 리스트를 생성
				const decks = [];

				// deckID를 이용
				for (const deckId of deckIds) {
					// 상응하는 deck를 가져온 후
					const deck = await env.FLASHCARDS_KV.get<Deck>(`user:${username}:deck:${deckId}`, 'json');
					// deck이 존재한다면
					if (deck) {
						// 몇장의 카드가 있는지 카운트
						const masteredCount = deck.cards.filter((card) => card.status === 'mastered').length;
						// deck에 마스터한 카드 개수를 추가 후 deck list에 넣음
						decks.push({ masteredCount, ...deck });
					}
				}

				// 방금만든 카드뭉치 (decksKey)와, 새로 만든 뭉치가 추가된 (deckIds) 페어를 FLASHCARDS_KV에 추가
				await env.FLASHCARDS_KV.put(decksKey, JSON.stringify(deckIds));

				return {
					// model에 넘겨 우리가 몇 개의 deck를 찾았는지 알림
					content: [
						{
							type: 'text',
							text: `총 ${decks.length}개, ${JSON.stringify(decks)}`,
						},
					],
					// 모든걸 위젯에 넘김
					structuredContent: { decks, username },
				};
			},
		);

		// open deck -> 선택한 카드 뭉치의 모든 카드를 가져옴(공부 시작)
		registerAppTool(
			server,
			'open-deck',
			{
				title: 'Open Deck',
				description:
					'이를 사용하여 사용자가 공부할 수 있는 Deck를 엽니다. 이 도구를 사용하기 전에 사용자에게 사용자 이름을 물어보세요. 덱 ID도 가지고 있는지 확인하세요.',
				inputSchema: {
					username: z.string().describe('사용자의 사용자 이름입니다. 도구를 사용하기 전에 이를 요청하세요.'),
					deckId: z.string().describe('deck의 ID입니다. `list-decks` 도구를 사용하여 얻을 수 있습니다'),
				},
				annotations: {
					readOnlyHint: true,
				},
				_meta: {
					ui: {
						resourceUri: WIDGET_URI,
					},
				},
			},
			async ({ username, deckId }) => {
				// username과 deckId 사용해서 key 생성
				const decksKey = `user:${username}:deck:${deckId}`;

				// 생성된 key를 통해 보유중인 모든 deck ID를 조회
				const deck = await env.FLASHCARDS_KV.get<Deck>(decksKey, 'json');

				// 보유중인 deck이 없음
				if (!deck) {
					return {
						content: [{ text: `Deck이 없습니다.`, type: 'text' }],
						structuredContent: { decks: [] },
					};
				}

				return {
					// model에 넘겨 우리가 몇 개의 deck를 찾았는지 알림
					content: [
						{
							type: 'text',
							text: `${deck.description}로 ${deck.title}이 공부하기 시작했습니다. ${JSON.stringify(deck.cards)}`,
						},
					],
					// 모든걸 위젯에 넘김
					structuredContent: { deck, username, deckId },
				};
			},
		);

		// mark card (private) -> (AI model 호출 X, 유저 클릭으로 호출) 단어의 암기상태 즉 유저가 단어 공부를 하다 특정 단어를 마스터 했다면 완벽히 숙달하고 기억, 그걸 유저가 볼 수 있게 표시 해줌 (몇개의 단어를 마스터했는지 또는 하지 못했는지 표시)
		registerAppTool(
			server,
			'mark-card',
			{
				title: 'Mark Card',
				description: '이것은 카드의 상태를 변경하기 위한 것입니다.',
				inputSchema: {
					username: z.string(),
					deckId: z.string(),
					status: z.enum(['learning', 'mastered']),
					cardId: z.string(),
				},
				annotations: {
					readOnlyHint: false,
				},
				_meta: {
					ui: {
						visibility: ['app'], // app -> AI model 호출없이, 클릭으로만 호출되는 tool들을 만들때 사용.
					},
				},
			},
			async ({ username, deckId, cardId, status }) => {
				// username과 deckId 사용해서 key 생성
				const deckKey = `user:${username}:deck:${deckId}`;

				// 생성된 key를 통해 보유중인 모든 deck ID를 조회
				const deck = await env.FLASHCARDS_KV.get<Deck>(deckKey, 'json');

				// 보유중인 deck이 없음
				if (!deck) {
					return {
						content: [{ text: `오류: 찾을 수 없음`, type: 'text' }],
						isError: true,
					};
				}

				// deck 안에서 card ID로 card 찾기 / 1.(deck object 안에 있는 card에 대한 reference를 받음)
				const card = deck.cards.find((card) => card.id === cardId);

				// 찾은 card의 status를 변경 / 2.(reference를 받기때문에 card.status = status값을 이렇게 바꾸는 것만으로도 deck object 안에서도 card status가 업데이트 됨)
				if (card) {
					card.status = status;
				}

				// 변경된 deck 저장
				await env.FLASHCARDS_KV.put(deckId, JSON.stringify(deck));

				return {
					// model에 넘겨 우리가 몇 개의 deck를 찾았는지 알림
					content: [
						{
							type: 'text',
							text: `카드 ${cardId}가 ${status} 상태로 업데이트 되었습니다.`,
						},
					],
					// 모든걸 위젯에 넘김
					structuredContent: { deck },
				};
			},
		);

		// reset deck (private) -> (AI model 호출 X, 유저 클릭으로 호출) 처음부터 공부를 다시 시작하고 싶을 수도 있으니 초기화 해줌
		registerAppTool(
			server,
			'reset-deck',
			{
				title: 'Reset Deck',
				description: '카드 뭉치의 고부 진도를 리셋하는 툴.',
				inputSchema: {
					username: z.string(),
					deckId: z.string(),
				},
				annotations: {
					readOnlyHint: true,
				},
				_meta: {
					ui: {
						visibility: ['app'], // app -> AI model 호출없이, 클릭으로만 호출되는 tool들을 만들때 사용.
					},
				},
			},
			async ({ username, deckId }) => {
				// username과 deckId 사용해서 key 생성
				const deckKey = `user:${username}:deck:${deckId}`;

				// 생성된 key를 통해 보유중인 모든 deck ID를 조회
				const deck = await env.FLASHCARDS_KV.get<Deck>(deckKey, 'json');

				// 보유중인 deck이 없음
				if (!deck) {
					return {
						content: [{ text: `오류: 찾을 수 없음`, type: 'text' }],
						isError: true,
					};
				}

				// deck 내의 각 card의 status를 new로 변경
				for (const card of deck.cards) {
					card.status = 'new';
				}

				// 수정된 deck을 저장
				await env.FLASHCARDS_KV.put(deckId, JSON.stringify(deck));

				return {
					// model에 넘겨 우리가 몇 개의 deck를 찾았는지 알림
					content: [
						{
							type: 'text',
							text: `Deck 진행 상황이 재설정되었습니다.`,
						},
					],
					// 모든걸 위젯에 넘김
					structuredContent: { deck },
				};
			},
		);

		// delete deck -> 카드 뭉치 삭제
		registerAppTool(
			server,
			'delete-deck',
			{
				title: 'Delete Deck',
				description:
					'이를 사용하여 Deck을 삭제합니다. usernaem을 모르는 경우 이 도구를 사용하기 전에 사용자에게 사용자 이름을 물어보세요. 덱 ID도 가지고 있는지 확인하세요.',
				inputSchema: {
					username: z.string().describe('사용자의 사용자 이름입니다. 도구를 사용하기 전에 이를 요청하세요.'),
					deckId: z.string().describe('삭제할 Deck의 ID. `list-decks` 도구를 사용하여 얻을 수 있습니다'),
				},
				annotations: {
					readOnlyHint: true,
				},
				_meta: {},
			},
			async ({ username, deckId }) => {
				// username과 deckId 사용해서 key 생성
				const deckKey = `user:${username}:deck:${deckId}`;

				// 생성된 key를 통해 보유중인 모든 deck ID를 조회
				const deck = await env.FLASHCARDS_KV.get<Deck>(deckKey, 'json');

				// 보유중인 deck이 없음
				if (!deck) {
					return {
						content: [{ text: `Deck이 없습니다.`, type: 'text' }],
					};
				}
				await env.FLASHCARDS_KV.delete(deckKey);

				return {
					// model에 넘겨 우리가 몇 개의 deck를 찾았는지 알림
					content: [
						{
							type: 'text',
							text: `Deck 삭제 완료`,
						},
					],
					// 모든걸 위젯에 넘김
					structuredContent: { deck, username, deckId },
				};
			},
		);

		// @ts-ignore
		const handler = createMcpHandler(server);

		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
