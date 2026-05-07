import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import { drizzle } from 'drizzle-orm/d1';
import z from 'zod';
import { workouts } from './schema';
import { eq } from 'drizzle-orm';

const WIDGET_URI = 'ui://workout-widget';

const exerciseSchema = z.object({
	name: z.string().describe("운동 이름(예: '푸시업')"),
	reps: z.number().min(1).describe('각 라운드를 완료할 담당자 수'),
	instructions: z.string().describe('간단한 양식 지침'),
	searchKeyword: z.string().optional().describe("양식 튜토리얼을 위한 YouTube 검색 키워드(예: '올바른 양식 푸시업')"),
});

export type Exercise = z.infer<typeof exerciseSchema>;

export default {
	async fetch(request, env, ctx) {
		const server = new McpServer({
			name: 'EMOM Workout App',
			version: '1.0',
		});

		registerAppResource(server, 'Workout Widget', WIDGET_URI, { description: 'Workout Widget' }, async () => {
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
									resourceDomains: ['https://*.workers.dev', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
								},
							},
						},
					},
				],
			};
		});

		// 도구 1: 새로운 운동 만들기
		registerAppTool(
			server,
			'create-workout',
			{
				title: 'EMOM 워크아웃 만들기',
				description:
					'새로운 EMOM 운동을 만듭니다. 5~10개의 운동으로 운동을 생성합니다. 각 운동에는 이름, 담당자, 지침, 양식 튜토리얼을 위한 YouTube 검색 키워드가 필요합니다.',
				inputSchema: {
					userId: z.string().describe('사용자의 사용자 이름입니다. 전화하기 전에 사용자에게 문의하세요.'),
					title: z.string().describe("운동 제목 (예: '상체 폭발')"),
					description: z.string().describe('운동에 대한 간단한 설명'),
					durationMinutes: z.number().min(1).max(60).describe('총 운동 시간(분)'),
					intervalSeconds: z.number().min(30).max(120).default(60).describe('간격당 초(기본값: 60)'),
					exercises: z.array(exerciseSchema).min(1).max(10).describe('운동 배열 (4-8개 권장)'),
				},
				annotations: { readOnlyHint: false },
				_meta: {
					ui: { resourceUri: WIDGET_URI },
				},
			},
			async ({ userId, title, description, durationMinutes, intervalSeconds, exercises }) => {
				const db = drizzle(env.DB);

				const [result] = await db
					.insert(workouts)
					.values({
						userId,
						title,
						description,
						durationMinutes,
						intervalSeconds,
						exercises,
						exerciseCount: exercises.length,
					})
					.returning();

				return {
					content: [{ type: 'text', text: `생성된 "${title}"\n운동 ID: ${result.id}\n설명: ${result.description}` }],
					structuredContent: {
						workout: result,
					},
				};
			},
		);

		// 도구 2: 모든 사용자의 운동을 확인합니다
		registerAppTool(
			server,
			'get-workouts',
			{
				title: '운동하기',
				description:
					'이를 사용하여 저장된 모든 EMOM 운동을 표시합니다. 운동 제목, 지속 시간 및 운동 횟수를 표시합니다. 사용자에게 어떤 운동을 보고 싶은지 물어본 다음 해당 ID로 운동하기를 사용하세요.',
				inputSchema: {
					userId: z.string().describe('사용자의 사용자 이름입니다. 전화하기 전에 사용자에게 요청하세요.'),
				},
				annotations: { readOnlyHint: true },
				_meta: {
					ui: { resourceUri: WIDGET_URI },
				},
			},
			async ({ userId }) => {
				// TODO: D1 데이터베이스에서 ID로 운동 가져오기
				const db = drizzle(env.DB);

				const result = await db
					.select({
						id: workouts.id,
						title: workouts.title,
						description: workouts.description,
						durationMinutes: workouts.durationMinutes,
						exerciseCount: workouts.exerciseCount,
					})
					.from(workouts)
					.where(eq(workouts.userId, userId))
					.orderBy(workouts.createdAt);

				if (result.length === 0) {
					return {
						content: [{ type: 'text', text: '운동을 찾을 수 없습니다.' }],
						structuredContent: { workouts: [] },
					};
				}

				const formattedWorkouts = result.map(
					(workout) =>
						`id:${workout.id}\ntitle:${workout.title}\ndescription:${workout.description}\ndurationMinutes:${workout.durationMinutes}\nexerciseCount:${workout.exerciseCount}\n\n=====\n\n`,
				);

				return {
					content: [{ type: 'text', text: `${result.length} 운동을 찾았습니다. workouts:\n\n${formattedWorkouts}` }],
					structuredContent: { workouts: result },
				};
			},
		);

		// 도구 3: 특정 운동하기
		registerAppTool(
			server,
			'get-workout',
			{
				title: '워크아웃 보기',
				description:
					'이를 사용하여 모든 운동과 함께 특정 EMOM 운동을 볼 수 있습니다. 위젯에는 전체 화면 타이머 세션을 여는 운동 시작 버튼이 표시됩니다.',
				inputSchema: {
					workoutId: z.string().describe('볼 운동 ID'),
				},
				annotations: { readOnlyHint: true },
				_meta: {
					ui: { resourceUri: WIDGET_URI },
				},
			},
			async ({ workoutId }) => {
				// TODO: D1 데이터베이스에서 ID로 운동 가져오기
				const db = drizzle(env.DB);

				const [result] = await db.select().from(workouts).where(eq(workouts.id, workoutId)).limit(1);

				if (result === undefined) {
					return {
						content: [{ type: 'text', text: '운동을 찾을 수 없습니다' }],
						isError: true,
					};
				}

				return {
					content: [{ type: 'text', text: '운동을 찾았습니다.' }],
					structuredContent: { workout: result },
				};
			},
		);

		// 도구 4: 운동 삭제
		registerAppTool(
			server,
			'delete-workout',
			{
				title: '운동 삭제',
				description: '운동을 영구적으로 삭제합니다. 이는 되돌릴 수 없습니다.',
				inputSchema: {
					workoutId: z.string().describe('삭제할 운동 ID'),
				},
				annotations: { destructiveHint: true },
				_meta: {},
			},
			async ({ workoutId }) => {
				// TODO: D1 데이터베이스에서 운동 삭제
				const db = drizzle(env.DB);

				await db.delete(workouts).where(eq(workouts.id, workoutId));

				return {
					content: [{ type: 'text', text: `삭제된 운동 ${workoutId}` }],
				};
			},
		);

		// 도구 5: 운동 완료(타이머 완료 후 위젯에서 호출)
		registerAppTool(
			server,
			'complete-workout',
			{
				title: '운동 완료',
				description: '사용자가 운동을 마치면 호출됩니다. 작업자 AI를 사용하여 수행된 운동을 기반으로 소모된 칼로리를 추정합니다.',
				inputSchema: {
					workoutId: z.string().describe('완료된 운동 ID'),
					roundsCompleted: z.number().min(0).describe('사용자가 실제로 완료한 라운드 수'),
				},
				annotations: { readOnlyHint: false },
				_meta: {
					ui: { visibility: ['app'] },
				},
			},
			async ({ workoutId, roundsCompleted }) => {
				// TODO: D1에서 운동을 가져오고, 작업자 AI를 통해 칼로리를 추정합니다
				const db = drizzle(env.DB);

				const [result] = await db.select().from(workouts).where(eq(workouts.id, workoutId)).limit(1);

				if (result === undefined) {
					return {
						content: [{ type: 'text', text: '운동을 찾을 수 없습니다' }],
						isError: true,
					};
				}

				const summary = result.exercises.map((e) => `${e.name}: ${e.reps}reps`).join(', ');

				// TODO: 근로자를 통한 칼로리 추정 AI
				const response = (await env.AI.run('@cf/zai-org/glm-4.7-flash' as keyof AiModels, {
					messages: [
						{
							role: 'system',
							content:
								'당신은 피트니스 칼로리 계산기입니다. 운동으로 인해 소모된 칼로리를 나타내는 단일 정수로만 답장하세요. 텍스트도 없고 단위도 없으며, 단일 정수 외에는 아무것도 없습니다.',
						},
						{
							role: 'user',
							content: `EMOM 운동을 했습니다. 정확히 얼마나 운동했는지 알려드리겠습니다:\n\n - 라운드 완료: ${roundsCompleted}\n - 라운드당 연습량: ${summary}`,
						},
					],
				})) as any;

				const calories = response.choices[0].message.content;

				return {
					content: [{ type: 'text', text: `운동 완료! 사용자가 ${calories}를 태웠습니다` }],
					structuredContent: { calories },
				};
			},
		);

		// @ts-ignore
		const handler = createMcpHandler(server);

		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
