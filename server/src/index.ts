import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import z from 'zod';
import {
	fetchMovieByGenre,
	fetchMovieDetails,
	fetchMovieGenres,
	fetchMovieReviews,
	fetchNowPlayingMovies,
	fetchSimilarMovies,
	fetchUpcomingMovies,
} from './fetcher';

const WIDGET_URI = 'ui://movies-widget';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const API_KEY = env.API_KEY;

		const server = new McpServer({
			name: 'Movies Server',
			version: '1.0.0',
		});

		registerAppResource(server, 'Movies Widget', WIDGET_URI, { description: 'Dev widget' }, async () => {
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

		// Claude에게 물어본다면 movies UI를 보여줄 텐데 Claude는 내가 말하는 movies가 어떤 movies인지 모름. 이유는 그 영화 정보가 content 안에 넣지 않았기 때문.
		// Cluade는 structuredContent를 보지 않음. 이건 위젯으로 감. content 가 Claude로 가는 정보 임.
		// ChatGPT는 structuredContent를 봄. 그래서 GPT가 받은 데이터를 줄 수 있음.
		registerAppTool(
			server,
			'get-upcoming-movies',
			{
				title: '곧 개봉할 영화 받기',
				description: '곧 또는 미래에 개봉할 영화를 볼 때 사용. 현재 영화관에서 상영 중인 영화는 tool 사용하지 않는다.',
				inputSchema: {},
				annotations: { readOnlyHint: true },
				_meta: {
					ui: {
						resourceUri: WIDGET_URI,
					},
					'openai/toolInvocation/invoking': '다가오는 영화 검색 중...',
					'openai/toolInvocation/invoked': '끝났습니다.',
				},
			},
			async () => {
				const movies = await fetchUpcomingMovies(API_KEY);
				return {
					content: [{ text: 'stuff', type: 'text' }],
					structuredContent: { movies },
				};
			},
		);

		registerAppTool(
			server,
			'get-now-playing-movies',
			{
				title: '지금 개봉 영화 받기',
				description:
					'지금 상영 중인 영화를 가져온다. 스트리밍 영화, 개봉 예정작 영화, 특정 영화 검색을 확인 할 때는 이 tool을 사용하지 않는다.',
				inputSchema: {},
				annotations: { readOnlyHint: true },
				_meta: {
					ui: {
						resourceUri: WIDGET_URI,
					},
					'openai/toolInvocation/invoking': '상영 중인 영화 검색 중...',
					'openai/toolInvocation/invoked': '끝났습니다.',
				},
			},
			async () => {
				const movies = await fetchNowPlayingMovies(API_KEY);
				return {
					content: [{ text: 'stuff', type: 'text' }],
					structuredContent: { movies },
				};
			},
		);

		registerAppTool(
			server,
			'get-similar-movies',
			{
				title: '유사한 영화 받기',
				description:
					'특정 영화, 비슷한 영화를 찾고 싶을 때 이 tool을 사용한다. 이전 리스트에서 가져온 movie ID가 필요. 특정 영화를 식별하기 전에는 사용하지 말 것.',
				inputSchema: {
					movieId: z
						.number()
						.positive()
						.describe(
							'비슷한 영화를 찾기 위한 영화의 id 이다. 다른 tool을 먼저 호출해서 얻은 값이다. 예)`get-upcoming-movies`, `get-now-playing-movies`.',
						),
				},
				annotations: { readOnlyHint: true },
				_meta: {
					ui: {
						resourceUri: WIDGET_URI,
					},
					'openai/toolInvocation/invoking': '비슷한 영화 검색 중...',
					'openai/toolInvocation/invoked': '끝났습니다.',
				},
			},
			async ({ movieId }) => {
				const movies = await fetchSimilarMovies(movieId, API_KEY);
				return {
					content: [{ text: 'stuff', type: 'text' }],
					structuredContent: { movies },
				};
			},
		);

		registerAppTool(
			server,
			'get-movie-reviews',
			{
				title: '영화 리뷰 받기',
				description: '특정 영화에 대한 리뷰를 찾고 싶을 때 이 tool을 사용. 이전 리스트에서 가져온 movie ID가 필요.',
				inputSchema: {
					movieId: z
						.number()
						.positive()
						.describe(
							'비슷한 영화를 찾기 위한 영화의 id 이다. 다른 tool을 먼저 호출해서 얻은 값이다. ex)`get-upcoming-movies`, `get-now-playing-movies`.',
						),
				},
				annotations: { readOnlyHint: true },
				_meta: {
					'openai/toolInvocation/invoking': '영화 리뷰 검색 중...',
					'openai/toolInvocation/invoked': '끝났습니다.',
				},
			},
			async ({ movieId }) => {
				const reviews = await fetchMovieReviews(movieId, API_KEY);
				return {
					content: [{ text: JSON.stringify(reviews), type: 'text' }],
				};
			},
		);

		registerAppTool(
			server,
			'get-movie-genres',
			{
				title: '영화 장르 받기',
				description: '장르 ID 리스트를 조회할 때 사용. `get-movies-by-genre`를 호출하기 전에 사용.',
				inputSchema: {},
				annotations: { readOnlyHint: true },
				_meta: {
					'openai/toolInvocation/invoking': '영화 장르 검색 중...',
					'openai/toolInvocation/invoked': '끝났습니다.',
				},
			},
			async () => {
				const genres = await fetchMovieGenres(API_KEY);
				return {
					content: [{ text: JSON.stringify(genres), type: 'text' }],
				};
			},
		);

		registerAppTool(
			server,
			'get-movies-by-genre',
			{
				title: '장르별 영화 받기',
				description: '특정 장르의 영화를 찾고 싶을 때 사용. 장르 ID 목록을 얻으려면 `get-movies-genres`를 먼저 사용.',
				inputSchema: {
					genreId: z
						.number()
						.positive()
						.describe('장르별 영화를 찾기 위한 장르 id 이다. 오직 `get-movies-genres` 이 tool을 사용한다. ex) 액션은 28, 다큐멘터리는 99'),
				},
				annotations: { readOnlyHint: true },
				_meta: {
					ui: {
						resourceUri: WIDGET_URI,
					},
					'openai/toolInvocation/invoking': '장르별 영화 검색 중...',
					'openai/toolInvocation/invoked': '끝났습니다.',
				},
			},
			async ({ genreId }) => {
				const movies = await fetchMovieByGenre(genreId, API_KEY);
				return {
					content: [{ text: 'stuff', type: 'text' }],
					structuredContent: { movies },
				};
			},
		);

		registerAppTool(
			server,
			'get-movie-details',
			{
				title: '영화 세부 정보 받기',
				description:
					'특정 영화에 대한 자세한 정보를 확인할때 사용. 시놉시스, 캐스팅, 평점, 배급사 같은 것들이 세부 정보에 속한다. 이전 리스트에서 가져온 movie ID가 필요. 특정 영화를 식별하기 전에는 이 tool을 사용하지 말것.',
				inputSchema: {
					movieId: z.number().positive().describe('세부 정보를 조회할 영화의 id. 영화 리스트를 반환하는 영화 tool을 사용.'),
				},
				annotations: { readOnlyHint: true },
				_meta: {
					ui: {
						resourceUri: WIDGET_URI,
					},
					'openai/toolInvocation/invoking': '영화 세부 정보 검색 중...',
					'openai/toolInvocation/invoked': '끝났습니다.',
				},
			},
			async ({ movieId }) => {
				const movie = fetchMovieDetails(movieId, API_KEY);
				return {
					content: [{ text: 'stuff', type: 'text' }],
					structuredContent: { movie },
				};
			},
		);

		const handler = createMcpHandler(server);

		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
