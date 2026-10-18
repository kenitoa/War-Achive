# 지도 데이터

`land-paths.json`은 Natural Earth의 `ne_110m_land.geojson`을 경위도 정방형 도법의 SVG 좌표(900 × 450)로 변환한 육지 윤곽입니다.

- 원본: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson
- 이용 조건: https://www.naturalearthdata.com/about/terms-of-use/ (public domain)
- 입수일: 2026-10-18
- 변환: x=(longitude+180)×2.5, y=(90-latitude)×2.5, 소수점 한 자리
- 국가 경계·전시 국경·공식 현장 위치를 나타내지 않습니다.

자료 좌표는 공개본의 `location`만 사용하며 미상인 자료를 임의로 배치하지 않습니다.
