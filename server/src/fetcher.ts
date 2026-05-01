async function fetchFromTMDB(endpoint: string, apikey: string, params: Record<string, string> = {}) {
	const searchParams = new URLSearchParams({
		page: '1',
		include_adult: 'false',
		language: 'en',
		...params,
	});
	const response = await fetch(`https://api.themoviedb.org/3${endpoint}?${searchParams}`, {
		headers: {
			Authorization: `Bearer ${apikey}`,
		},
	});

	if (!response.ok) {
		throw new Error('API에서 가져올 수 없습니다.');
	}

	return response.json();
}

export async function fetchUpcomingMovies(apikey: string) {
	return fetchFromTMDB(`/movie/upcoming`, apikey);
}
export async function fetchNowPlayingMovies(apikey: string) {
	return fetchFromTMDB(`/movie/now_playing`, apikey);
}
export async function fetchSimilarMovies(movieId: number, apikey: string) {
	return fetchFromTMDB(`/movie/${movieId}/similar`, apikey);
}
export async function fetchMovieReviews(movieId: number, apikey: string) {
	return fetchFromTMDB(`/movie/${movieId}/reviews`, apikey);
}
export async function fetchMovieGenres(apikey: string) {
	return fetchFromTMDB(`/genre/movie/list`, apikey);
}
export async function fetchMovieByGenre(genreId: number, apikey: string) {
	return fetchFromTMDB(`/discover/movie`, apikey, {
		with_genres: String(genreId),
		sort_by: 'popularity.desc',
	});
}
export async function fetchMovieDetails(movieId: number, apikey: string) {
	return fetchFromTMDB(`/movie/${movieId}`, apikey);
}
