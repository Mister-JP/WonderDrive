import fs from "node:fs";
import sharp from "sharp";

const elements=[]; let n=0;
function b(type,x,y,width,height,o={}){n++;return{id:`wdu-${n}`,type,x,y,width,height,angle:0,strokeColor:o.strokeColor??"#17212b",backgroundColor:o.backgroundColor??"transparent",fillStyle:"solid",strokeWidth:o.strokeWidth??2,strokeStyle:o.strokeStyle??"solid",roughness:o.roughness??1.25,opacity:100,groupIds:[],frameId:null,index:`a${n.toString(36)}`,roundness:o.roundness===false?null:{type:3},seed:9000+n*83,version:1,versionNonce:22000+n*109,isDeleted:false,boundElements:null,updated:1783987200000,link:null,locked:false}}
const rect=(x,y,w,h,o={})=>elements.push(b("rectangle",x,y,w,h,o));
const ellipse=(x,y,w,h,o={})=>elements.push(b("ellipse",x,y,w,h,{...o,roundness:false}));
function text(x,y,value,size=16,o={}){const ls=value.split("\n");elements.push({...b("text",x,y,o.width??Math.max(...ls.map(s=>s.length))*size*.56,o.height??ls.length*size*1.25,{strokeColor:o.strokeColor,roughness:0,roundness:false}),fontSize:size,fontFamily:5,text:value,textAlign:"left",verticalAlign:"top",containerId:null,originalText:value,autoResize:true,lineHeight:1.25})}
function path(type,x,y,points,o={}){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);elements.push({...b(type,x,y,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),{...o,roundness:false}),points,lastCommittedPoint:null,startBinding:null,endBinding:null,startArrowhead:null,endArrowhead:type==="arrow"?"arrow":null,elbowed:false})}
const line=(x,y,p,o={})=>path("line",x,y,p,o), arrow=(x,y,p,o={})=>path("arrow",x,y,p,o);

text(70,38,"WonderDrive — one answer screen, two states",36);
text(72,88,"Loading happens inside the information layout; the page never swaps to a separate research screen.",17,{strokeColor:"#667085"});
rect(1915,42,420,52,{backgroundColor:"#dfff58"}); text(1972,57,"PERSISTENT SHELL · PROGRESSIVE REVEAL",13);

// Reusable shell, drawn twice to communicate state, not separate destinations.
function shell(x,label,state){
  ellipse(x,150,42,42,{backgroundColor:state==="loading"?"#acd8ff":"#dfff58"}); text(x+14,158,state==="loading"?"1":"2",18);
  text(x+57,152,label,24); text(x+57,185,state==="loading"?"Same URL · research fills the answer panel":"Same URL · content replaces its placeholders",12,{strokeColor:"#667085"});
  rect(x,228,1110,1150,{backgroundColor:"#fffdf8",strokeWidth:3,roughness:1.6});
  rect(x,228,1110,57,{backgroundColor:"#eeeae2",strokeWidth:2});
  ellipse(x+25,249,12,12,{backgroundColor:"#ff7b67",strokeWidth:1}); ellipse(x+48,249,12,12,{backgroundColor:"#ffd166",strokeWidth:1}); ellipse(x+71,249,12,12,{backgroundColor:"#81d88d",strokeWidth:1});
  rect(x+290,242,530,29,{backgroundColor:"#ffffff",strokeColor:"#b7bec6",strokeWidth:1}); text(x+448,248,"wonderdrive.app/journey/7",11,{strokeColor:"#667085"});
  text(x+32,307,"WONDERDRIVE",16); text(x+495,309,"Journey",12); text(x+575,309,"Map",12,{strokeColor:"#667085"}); text(x+1022,309,"•••",14);
  line(x+25,343,[[0,0],[1060,0]],{strokeColor:"#c9cfd5",strokeWidth:1});
  text(x+42,375,"TURN 01 · SAGE",10,{strokeColor:"#d64b38"});
  text(x+42,403,"Where does a city",31); text(x+42,442,"keep its memories?",31);
  rect(x+860,376,90,55,{backgroundColor:"#ffffff",strokeColor:"#aeb6bd",strokeWidth:1}); text(x+881,384,"1",20); text(x+876,411,"TURN",8,{strokeColor:"#667085"});
  rect(x+950,376,112,55,{backgroundColor:"#ffffff",strokeColor:"#aeb6bd",strokeWidth:1}); text(x+972,384,state==="loading"?"—":"4",20); text(x+973,411,"SOURCES",8,{strokeColor:"#667085"});
  line(x+25,495,[[0,0],[1060,0]],{strokeColor:"#c9cfd5",strokeWidth:1});
  // stable 65/35 content grid
  line(x+702,495,[[0,0],[0,850]],{strokeColor:"#aeb6bd",strokeWidth:1});
  return x;
}

const l=shell(70,"Researching in place","loading");
// Loading state: content-shaped placeholders plus real progress in the answer region.
ellipse(l+48,531,42,42,{backgroundColor:"#ffb3a7",strokeColor:"#ff7b67",strokeWidth:1}); text(l+63,540,"S",16,{strokeColor:"#9e2d20"});
text(l+104,529,"Sage is researching",16); text(l+104,552,"performed from live web research",10,{strokeColor:"#667085"});
rect(l+570,529,91,28,{backgroundColor:"#e6f4ff",strokeColor:"#3182ce",strokeWidth:1}); text(l+586,536,"IN PROGRESS",9,{strokeColor:"#1971c2"});
line(l+42,590,[[0,0],[618,0]],{strokeColor:"#c9cfd5",strokeWidth:1});
text(l+46,616,"LIVE RESEARCH",10,{strokeColor:"#1971c2"}); text(l+524,616,"KEEP THIS PAGE OPEN",9,{strokeColor:"#667085"});
const ev=[["01","Reserved one foreground run","#dfff58"],["02","Searching archives and civic records","#acd8ff"],["03","Checking dates across primary sources","#ff7b67"],["04","Composing a sourced explanation","#dfff58"]];
ev.forEach(([num,label,c],i)=>{const y=650+i*66;text(l+48,y,num,12,{strokeColor:"#7b8791"});ellipse(l+83,y+2,12,12,{backgroundColor:c,strokeColor:c,strokeWidth:1});text(l+111,y-2,label,12);line(l+48,y+33,[[0,0],[575,0]],{strokeColor:"#d5dade",strokeWidth:1})});
rect(l+48,933,575,5,{backgroundColor:"#d9dee2",strokeColor:"#d9dee2",strokeWidth:1}); rect(l+48,933,390,5,{backgroundColor:"#dfff58",strokeColor:"#dfff58",strokeWidth:1});
text(l+48,951,"SEARCH",8,{strokeColor:"#6c8d00"}); text(l+290,951,"CHECK",8,{strokeColor:"#1971c2"}); text(l+548,951,"COMPOSE",8,{strokeColor:"#9aa4ac"});
// Skeleton answer remains spatially stable.
rect(l+48,1000,550,17,{backgroundColor:"#dfe4e7",strokeColor:"#dfe4e7",strokeWidth:1}); rect(l+48,1033,600,17,{backgroundColor:"#e7eaec",strokeColor:"#e7eaec",strokeWidth:1}); rect(l+48,1066,490,17,{backgroundColor:"#e7eaec",strokeColor:"#e7eaec",strokeWidth:1});
rect(l+48,1125,600,76,{backgroundColor:"#eff1f2",strokeColor:"#d6dce0",strokeWidth:1});
rect(l+48,1231,600,49,{backgroundColor:"#ffffff",strokeColor:"#b7bec6",strokeWidth:1}); text(l+68,1247,"Sources & evidence",11,{strokeColor:"#7b8791"}); text(l+608,1247,"⌄",14,{strokeColor:"#7b8791"});
// Right rail stays present but disabled.
text(l+737,533,"AUDIENCE DIRECTION",9,{strokeColor:"#7b8791"}); text(l+737,564,"Where should",25,{strokeColor:"#59636b"}); text(l+737,595,"curiosity go next?",25,{strokeColor:"#59636b"});
text(l+737,641,"Paths appear when the sourced answer is ready.",11,{strokeColor:"#8a949c"});
rect(l+737,691,320,148,{backgroundColor:"#eef1f2",strokeColor:"#c8ced3",strokeStyle:"dashed"}); rect(l+737,858,320,148,{backgroundColor:"#eef1f2",strokeColor:"#c8ced3",strokeStyle:"dashed"});
text(l+843,755,"PATH A",11,{strokeColor:"#9aa3aa"}); text(l+843,922,"PATH B",11,{strokeColor:"#9aa3aa"});
rect(l+737,1037,320,54,{backgroundColor:"#f2f3f4",strokeColor:"#c8ced3"}); text(l+815,1055,"Available after research",10,{strokeColor:"#8b959c"});

const r=shell(1250,"Information displayed","ready");
// Ready state, exactly same geometry.
ellipse(r+48,531,42,42,{backgroundColor:"#ffb3a7",strokeColor:"#ff7b67",strokeWidth:1}); text(r+63,540,"S",16,{strokeColor:"#9e2d20"});
text(r+104,529,"Sage",16); text(r+104,552,"performed from live web research",10,{strokeColor:"#667085"});
rect(r+570,529,91,28,{backgroundColor:"#dfff58",strokeColor:"#17212b",strokeWidth:1}); text(r+588,536,"COMPOSED",9);
line(r+42,590,[[0,0],[618,0]],{strokeColor:"#c9cfd5",strokeWidth:1});
text(r+48,622,"C",54); text(r+89,624,"ities remember in layers: through street names, buildings,",16); text(r+89,650,"archives, rituals, and the stories residents repeat. Official",16); text(r+48,681,"records preserve decisions, while everyday memory often survives",16); text(r+48,707,"in landmarks, local language, and contested public space.",16);
ellipse(r+557,704,18,18,{backgroundColor:"#acd8ff",strokeWidth:1}); text(r+563,706,"1",9);
text(r+48,759,"What a city chooses to preserve—and what it allows to disappear—",16); text(r+48,785,"reveals who has had the power to define its shared past.",16); ellipse(r+490,782,18,18,{backgroundColor:"#acd8ff",strokeWidth:1}); text(r+496,784,"2",9);
rect(r+48,843,600,95,{backgroundColor:"#efffc4",strokeColor:"#17212b",strokeWidth:1}); text(r+69,858,"WHERE THIS LEAVES US",9); text(r+69,882,"A city's memory is less like a vault and more like a",14); text(r+69,905,"negotiation that every generation quietly edits.",14);
rect(r+48,974,600,50,{backgroundColor:"#ffffff",strokeColor:"#17212b",strokeWidth:1}); text(r+68,990,"Sources & evidence",11); text(r+511,990,"4 inspectable links",9,{strokeColor:"#667085"}); text(r+620,990,"⌄",14);
rect(r+48,1024,600,50,{backgroundColor:"#ffffff",strokeColor:"#17212b",strokeWidth:1}); text(r+68,1040,"Research Trail",11); text(r+486,1040,"activity, not reasoning",9,{strokeColor:"#667085"}); text(r+620,1040,"⌄",14);
rect(r+48,1074,600,50,{backgroundColor:"#ffffff",strokeColor:"#17212b",strokeWidth:1}); text(r+68,1090,"Performance metadata",11); text(r+620,1090,"⌄",14);
// Active direction rail.
rect(r+703,495,382,850,{backgroundColor:"#17212b",strokeColor:"#17212b",strokeWidth:1});
text(r+737,533,"AUDIENCE DIRECTION / 02 PATHS",9,{strokeColor:"#dfff58"}); text(r+737,570,"Where should",28,{strokeColor:"#fffdf8"}); text(r+737,605,"curiosity go next?",28,{strokeColor:"#fffdf8"}); text(r+737,649,"Nothing advances until you decide.",11,{strokeColor:"#aab3ba"});
rect(r+737,698,314,168,{backgroundColor:"#acd8ff",strokeColor:"#fffdf8",strokeWidth:1}); ellipse(r+756,716,24,24,{backgroundColor:"#17212b",strokeColor:"#17212b",strokeWidth:1}); text(r+764,718,"A",10,{strokeColor:"#ffffff"}); text(r+793,720,"PLACE & POWER",9); text(r+756,758,"Who decides which city",18); text(r+756,783,"memories become official?",18); line(r+756,823,[[0,0],[274,0]],{strokeColor:"#5c7588",strokeWidth:1}); text(r+756,837,"TAKE THIS PATH",9);
rect(r+737,882,314,168,{backgroundColor:"#dfff58",strokeColor:"#fffdf8",strokeWidth:1}); ellipse(r+756,900,24,24,{backgroundColor:"#17212b",strokeColor:"#17212b",strokeWidth:1}); text(r+764,902,"B",10,{strokeColor:"#ffffff"}); text(r+793,904,"LOSS & RECOVERY",9); text(r+756,942,"Can a city recover a",18); text(r+756,967,"memory it erased?",18); line(r+756,1007,[[0,0],[274,0]],{strokeColor:"#687b1f",strokeWidth:1}); text(r+756,1021,"TAKE THIS PATH",9);
rect(r+737,1082,314,55,{backgroundColor:"#17212b",strokeColor:"#ffffff",strokeWidth:1}); text(r+762,1099,"✦  Let Sage choose",12,{strokeColor:"#fffdf8"}); text(r+1020,1099,"→",15,{strokeColor:"#dfff58"});
line(r+737,1175,[[0,0],[314,0]],{strokeColor:"#59646c",strokeWidth:1}); text(r+737,1195,"NEITHER PATH?",10,{strokeColor:"#fffdf8"}); text(r+737,1222,"Grounded",8,{strokeColor:"#9da7ae"}); line(r+800,1228,[[0,0],[175,0]],{strokeColor:"#ff7b67",strokeWidth:3}); ellipse(r+882,1220,16,16,{backgroundColor:"#ff7b67",strokeColor:"#ff7b67",strokeWidth:1}); text(r+988,1222,"Adventurous",8,{strokeColor:"#9da7ae"});
rect(r+737,1260,314,45,{backgroundColor:"#ff7b67",strokeColor:"#fffdf8",strokeWidth:1}); text(r+825,1274,"REJECT BOTH & REDRAW",9);

// State continuity callout.
arrow(1188,695,[[0,0],[48,0]],{strokeColor:"#ff7b67",strokeWidth:4});
rect(1125,625,170,48,{backgroundColor:"#fffdf8",strokeColor:"#ff7b67",strokeWidth:1}); text(1146,636,"CONTENT REPLACES",9,{strokeColor:"#d64b38"}); text(1153,650,"PLACEHOLDERS",9,{strokeColor:"#d64b38"});
line(70,1418,[[0,0],[2290,0]],{strokeColor:"#b7bec6",strokeWidth:1});
rect(70,1450,2290,130,{backgroundColor:"#e6f4ff",strokeColor:"#3182ce",roughness:1.5}); text(100,1476,"UNIFIED BEHAVIOR",12,{strokeColor:"#1971c2"}); text(100,1507,"The question header, answer column, and direction rail mount once. During research, the answer column shows observable activity and content-shaped",15); text(100,1535,"placeholders while paths remain visibly disabled. When validation succeeds, information and choices replace those regions without a page change.",15);

const drawing={type:"excalidraw",version:2,source:"https://excalidraw.com",elements,appState:{gridSize:null,viewBackgroundColor:"#f7f5ef",currentItemFontFamily:5},files:{}};
fs.mkdirSync("design",{recursive:true}); const stem="design/wonderdrive-unified-information-loading";
fs.writeFileSync(`${stem}.excalidraw`,`${JSON.stringify(drawing,null,2)}\n`);
const esc=s=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="2430" height="1630" viewBox="0 0 2430 1630"><rect width="2430" height="1630" fill="#f7f5ef"/><style>text{font-family:Arial,Helvetica,sans-serif}</style><defs><filter id="w"><feTurbulence baseFrequency=".012" numOctaves="1" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".7"/></filter></defs>`];
for(const e of elements){const fill=e.backgroundColor==="transparent"?"none":e.backgroundColor;if(e.type==="rectangle")out.push(`<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="${e.roundness?7:0}" fill="${fill}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}" ${e.strokeStyle==="dashed"?'stroke-dasharray="9 7"':""} filter="url(#w)"/>`);if(e.type==="ellipse")out.push(`<ellipse cx="${e.x+e.width/2}" cy="${e.y+e.height/2}" rx="${e.width/2}" ry="${e.height/2}" fill="${fill}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}" filter="url(#w)"/>`);if(e.type==="line"||e.type==="arrow"){const pts=e.points.map(p=>`${e.x+p[0]},${e.y+p[1]}`).join(" ");out.push(`<polyline points="${pts}" fill="none" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}" ${e.strokeStyle==="dashed"?'stroke-dasharray="9 7"':""}/>`);if(e.type==="arrow"){const q=e.points.at(-1),ex=e.x+q[0],ey=e.y+q[1];out.push(`<path d="M${ex-12},${ey-8} L${ex},${ey} L${ex-12},${ey+8}" fill="none" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"/>`)}}if(e.type==="text"){const ls=e.text.split("\n");out.push(`<text x="${e.x}" y="${e.y+e.fontSize}" fill="${e.strokeColor}" font-size="${e.fontSize}" font-weight="${e.fontSize>=24?600:500}">${ls.map((s,i)=>`<tspan x="${e.x}" dy="${i?e.fontSize*1.25:0}">${esc(s)}</tspan>`).join("")}</text>`)}}
out.push("</svg>");fs.writeFileSync(`${stem}.svg`,out.join("\n"));await sharp(Buffer.from(out.join("\n"))).png().toFile(`${stem}.png`);console.log(`Created ${stem}.{excalidraw,svg,png}`);
