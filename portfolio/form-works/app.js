document.documentElement.classList.add('js');
const menu = document.querySelector('.menu');
const nav = document.querySelector('.nav');
menu?.addEventListener('click', () => {const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);menu.textContent=open?'閉じる ×':'メニュー ＋';});
document.addEventListener('keydown', e=>{if(e.key==='Escape'&&menu?.getAttribute('aria-expanded')==='true'){menu.click();menu.focus();}});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{if(menu?.getAttribute('aria-expanded')==='true')menu.click();}));
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const journey = document.querySelector('.journey');
if(journey){
 const buttons=[...document.querySelectorAll('[data-stage]')];
 const captions=['部品ごとの役割から、製品を考える。','一つひとつを組み合わせ、機能をつくる。','組立の先に、確かめる工程を。','完成した製品を、次のものづくりへ。'];
 const names=['COMPONENTS','ASSEMBLY','INSPECTION','PRODUCT'];
 let active=-1, scheduled=false;
 function setStage(n){if(active===n)return;active=n;journey.dataset.step=n;buttons.forEach((b,i)=>{b.classList.toggle('active',i===n);b.setAttribute('aria-pressed',String(i===n));});document.querySelector('#step-copy').textContent=captions[n];document.querySelector('#step-number').textContent=`0${n+1} / ${names[n]}`;document.querySelector('#art-state').textContent=names[n];}
 function staticScene(){return motion.matches||getComputedStyle(document.querySelector('.scene')).position!=='sticky';}
 function update(){scheduled=false;if(staticScene())return;const r=journey.getBoundingClientRect();const header=document.querySelector('.header').offsetHeight;const span=journey.offsetHeight-document.querySelector('.scene').offsetHeight;const p=Math.min(1,Math.max(0,(header-r.top)/Math.max(1,span)));setStage(Math.min(3,Math.floor(p*4)));}
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
 window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
 buttons.forEach((b,i)=>b.addEventListener('click',()=>{if(staticScene()){setStage(i);return;}const header=document.querySelector('.header').offsetHeight;const start=journey.getBoundingClientRect().top+scrollY-header;const span=journey.offsetHeight-document.querySelector('.scene').offsetHeight;setStage(i);window.scrollTo({top:start+span*((i+.1)/4),behavior:'smooth'});}));
 motion.addEventListener('change',()=>{setStage(0);schedule();});setStage(0);update();
}
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target);}}),{threshold:.08});document.querySelectorAll('.reveal').forEach(e=>observer.observe(e));
const contact=document.querySelector('#contact-link');
if(contact){document.querySelectorAll('[data-inquiry]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-inquiry]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));const url=new URL(contact.href);url.searchParams.set('inquiry_type',b.dataset.inquiry);contact.href=url.toString();}));}
// Load the same tag manager used by the AIdealize corporate site.
window.dataLayer=window.dataLayer||[];
window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});
const gtmScript=document.createElement('script');
gtmScript.async=true;
gtmScript.src='https://www.googletagmanager.com/gtm.js?id=GTM-P6VNBWH3';
document.head.appendChild(gtmScript);
