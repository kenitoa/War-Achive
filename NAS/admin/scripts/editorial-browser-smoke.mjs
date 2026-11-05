import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArchiveService } from '../../back/dist/application/archive-service.js';
import { buildApi } from '../../back/dist/presentation/api.js';
import { loadConfig } from '../../back/dist/config.js';

// This test owns its temporary DB and never reads/writes a deployed NAS instance.
const nas=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),root=await mkdtemp(resolve(tmpdir(),'editorial-browser-'));
const token='isolated-editorial-browser-token-0123456789';
const service=await createArchiveService({pglitePath:resolve(root,'db'),dataDir:resolve(root,'data'),exportDir:resolve(root,'release'),autoPublish:false,skipDnsCheckForTests:true,fetcher:async()=>Response.json({query:{pages:{'12':{pageid:12,title:'File:기록 자료.jpg',imageinfo:[{descriptionurl:'https://commons.wikimedia.org/wiki/File:Archive.jpg',extmetadata:{ImageDescription:{value:'테스트 소장 기록 설명'},DateTimeOriginal:{value:'1951'},LicenseShortName:{value:'Public domain'}}}]}}}})});
const config=loadConfig({NODE_ENV:'test',WAR_ARCHIVE_ADMIN_TOKEN:token,DATABASE_URL:'',ADMIN_TOTP_SECRET:'',REMOTE_PUBLISH_ENABLED:'false',COOKIE_SAME_SITE:'lax'});
const app=buildApi(service,config,{logger:false,adminDir:resolve(nas,'admin/dist')});
let browser;
try{
  const source=await service.createSource({name:'시험용 소장처',provider:'commons',query:'archive',policy:{status:'approved',allowAutoPublish:true,metadataOnly:true,rightsLabel:'원문 이용 조건 확인'}},'test-reviewer');
  await service.collectSource(source.id);await service.runNextJob();await service.runNextJob();await service.runNextJob();
  const record=(await service.listRecords())[0];const item=await service.editorial.create({recordIds:[record.id],title:'전쟁 기록 읽기'},'test-editor');
  const origin=await app.listen({host:'127.0.0.1',port:0});config.allowedOrigins.add(origin);
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/admin/`);await page.getByLabel('관리자 토큰').fill(token);await page.getByRole('button',{name:/관리실 들어가기/}).click();
  await page.getByRole('button',{name:/분석·블로그 편집실/}).click();await page.getByRole('heading',{name:'원고 편집·검수'}).waitFor();
  await page.getByText('여러 자료를 묶어 원고 생성',{exact:true}).click();
  await page.getByLabel('근거 자료 검색',{exact:true}).fill('기록');await page.locator('.evidence-options input').first().check();
  await page.getByLabel('근거 자료 검색',{exact:true}).fill('no-matching-record');await page.getByText('일치하는 공개 자료가 없습니다.',{exact:true}).waitFor();
  assert.equal(await page.locator('input[type=hidden][name=recordIds]').count(),1);
  await page.getByText('여러 자료를 묶어 원고 생성',{exact:true}).click();
  await page.getByLabel('제목',{exact:true}).fill('개정한 기록 노트');await page.getByRole('button',{name:'편집본 저장',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.editorial-editor input')?.value==='개정한 기록 노트');
  await page.getByLabel('문단별 근거와 내용 확인').check();await page.getByLabel('인용·이미지·재사용 권리 확인').check();await page.getByLabel('검수·처리 사유').fill('근거 자료와 인용 권리 확인 완료');await page.getByRole('button',{name:'승인·발행 예약'}).click();
  await page.waitForFunction(()=>document.querySelector('.editorial-list .status')?.textContent==='승인');await service.editorial.publishNext();
  const publicPage=await browser.newPage();await publicPage.goto(`${origin}/blog/${item.slug}/`);await publicPage.getByRole('heading',{name:'개정한 기록 노트',exact:true}).waitFor();assert.equal(await publicPage.locator('.citations a').count(),1);
  await mkdir(resolve(nas,'admin/artifacts'),{recursive:true});await page.screenshot({path:resolve(nas,'admin/artifacts/editorial-desktop.png'),fullPage:true});await publicPage.screenshot({path:resolve(nas,'admin/artifacts/blog-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:resolve(nas,'admin/artifacts/editorial-mobile.png'),fullPage:true});
  const latest=await service.editorial.get(item.id);await service.editorial.decide(item.id,{decision:'withdraw',expectedRevision:latest.revision,note:'테스트 철회'},'test-publisher');assert.equal((await publicPage.goto(`${origin}/blog/${item.slug}/`)).status(),404);assert.deepEqual(errors,[]);
  console.log('PASS isolated admin login, article edit, evidence approval, blog publication, withdrawal and mobile layout');
}finally{await browser?.close();await app.close();await service.close();await rm(root,{recursive:true,force:true});}
