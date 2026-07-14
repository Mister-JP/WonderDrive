import fs from "node:fs";
import sharp from "sharp";

const W=1920,H=1080;
const templates=[
  {slug:"editorial",title:"Editorial reading",subtitle:"No image · long-form answer with a quiet evidence rail",kind:"editorial"},
  {slug:"brief",title:"Scannable research brief",subtitle:"No image · summary, findings, and uncertainty at a glance",kind:"brief"},
  {slug:"image-split",title:"Image + interpretation",subtitle:"Image-led · a sourced visual supports the main explanation",kind:"split"},
  {slug:"image-banner",title:"Visual field note",subtitle:"Image-led · panoramic evidence with compact two-column reading",kind:"banner"},
];

function scene(config){
  const E=[];let id=0;
  function base(type,x,y,width,height,o={}){id++;return{id:`wdct-${config.slug}-${id}`,type,x,y,width,height,angle:o.angle??0,strokeColor:o.strokeColor??"#17212b",backgroundColor:o.backgroundColor??"transparent",fillStyle:"solid",strokeWidth:o.strokeWidth??2,strokeStyle:o.strokeStyle??"solid",roughness:o.roughness??1.05,opacity:o.opacity??100,groupIds:[],frameId:null,index:`a${id.toString(36)}`,roundness:o.roundness===false?null:{type:3},seed:16000+id*73,version:1,versionNonce:31000+id*103,isDeleted:false,boundElements:null,updated:1783987200000,link:null,locked:false}}
  const rect=(x,y,w,h,o={})=>E.push(base("rectangle",x,y,w,h,o)); const ellipse=(x,y,w,h,o={})=>E.push(base("ellipse",x,y,w,h,{...o,roundness:false}));
  function text(x,y,value,size=16,o={}){const ls=value.split("\n");E.push({...base("text",x,y,o.width??Math.max(...ls.map(s=>s.length))*size*.54,o.height??ls.length*size*1.2,{strokeColor:o.strokeColor,roughness:0,roundness:false,angle:o.angle}),fontSize:size,fontFamily:5,text:value,textAlign:o.textAlign??"left",verticalAlign:"top",containerId:null,originalText:value,autoResize:true,lineHeight:1.2})}
  function path(type,x,y,points,o={}){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);E.push({...base(type,x,y,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),{...o,roundness:false}),points,lastCommittedPoint:null,startBinding:null,endBinding:null,startArrowhead:null,endArrowhead:type==="arrow"?"arrow":null,elbowed:false})}
  const line=(x,y,p,o={})=>path("line",x,y,p,o);

  // 16:9 board and application shell.
  rect(15,15,1890,1050,{backgroundColor:"#fffdf8",strokeWidth:3,roughness:1.35});
  rect(15,15,1890,54,{backgroundColor:"#eeeae2",strokeWidth:2});
  ellipse(38,36,11,11,{backgroundColor:"#ff7b67",strokeWidth:1});ellipse(59,36,11,11,{backgroundColor:"#ffd166",strokeWidth:1});ellipse(80,36,11,11,{backgroundColor:"#81d88d",strokeWidth:1});
  rect(700,28,520,28,{backgroundColor:"#ffffff",strokeColor:"#bbc3c9",strokeWidth:1});text(858,34,"wonderdrive.app/journey/7",10,{strokeColor:"#667085"});
  text(48,88,"WONDERDRIVE",15);text(810,90,"Journey",11);text(892,90,"Map",11,{strokeColor:"#667085"});text(1767,90,"1 turn · 4 sources",10,{strokeColor:"#667085"});ellipse(1870,90,12,12,{backgroundColor:"#81d88d",strokeColor:"#2f7d3a",strokeWidth:1});
  line(38,121,[[0,0],[1840,0]],{strokeColor:"#cbd1d6",strokeWidth:1});
  // Compact title and utility band.
  text(58,144,"TURN 01 · SAGE",9,{strokeColor:"#d64b38"});text(58,168,"Where does a city keep its memories?",28);
  rect(1260,146,106,32,{backgroundColor:"#dfff58",strokeColor:"#17212b",strokeWidth:1});text(1280,155,"COMPOSED",9);
  const tools=[["◉","Read"],["◇","Save"],["⇩","Export"],["↗","Map"]];
  tools.forEach(([icon,label],i)=>{const x=1380+i*120;rect(x,146,108,32,{backgroundColor:"#ffffff",strokeColor:"#aeb7be",strokeWidth:1});text(x+11,153,icon,12);text(x+33,155,label.toUpperCase(),8)});
  text(58,207,"Sage · patient connections",11);text(220,208,"LIVE WEB RESEARCH",8,{strokeColor:"#1971c2"});text(350,208,"4 sources · 38 sec · $0.018",9,{strokeColor:"#667085"});
  line(38,236,[[0,0],[1840,0]],{strokeColor:"#cbd1d6",strokeWidth:1});

  function cite(x,y,num){ellipse(x,y,17,17,{backgroundColor:"#acd8ff",strokeColor:"#17212b",strokeWidth:1});text(x+5.5,y+2,String(num),8)}
  function drawers(x,y,w){const labels=[["Sources & evidence","4 links"],["Research trail","activity"],["Run details","model · cost"]];labels.forEach(([a,b],i)=>{rect(x,y+i*35,w,35,{backgroundColor:"#ffffff",strokeColor:"#aeb7be",strokeWidth:1});text(x+13,y+10+i*35,a,9);text(x+w-92,y+10+i*35,b,8,{strokeColor:"#667085"});text(x+w-18,y+8+i*35,"⌄",11)})}
  function bottom(y){
    line(52,y,[[0,0],[1815,0]],{strokeColor:"#17212b",strokeWidth:1});text(58,y+18,"UP NEXT · CHOOSE ONE",9,{strokeColor:"#d64b38"});text(58,y+38,"Where should curiosity go next?",18);
    const cy=y+68;rect(58,cy,708,124,{backgroundColor:"#acd8ff",strokeColor:"#17212b",strokeWidth:2});ellipse(76,cy+16,22,22,{backgroundColor:"#17212b",strokeColor:"#17212b",strokeWidth:1});text(84,cy+18,"A",9,{strokeColor:"#ffffff"});text(110,cy+18,"PLACE & POWER",8);text(77,cy+49,"Who decides which city memories become official?",17);line(77,cy+87,[[0,0],[665,0]],{strokeColor:"#5d7587",strokeWidth:1});text(77,cy+99,"TAKE THIS PATH",8);text(730,cy+93,"↘",16);
    rect(786,cy,708,124,{backgroundColor:"#dfff58",strokeColor:"#17212b",strokeWidth:2});ellipse(804,cy+16,22,22,{backgroundColor:"#17212b",strokeColor:"#17212b",strokeWidth:1});text(812,cy+18,"B",9,{strokeColor:"#ffffff"});text(838,cy+18,"LOSS & RECOVERY",8);text(805,cy+49,"Can a city recover a memory it deliberately erased?",17);line(805,cy+87,[[0,0],[665,0]],{strokeColor:"#71831e",strokeWidth:1});text(805,cy+99,"TAKE THIS PATH",8);text(1458,cy+93,"↘",16);
    rect(1517,cy,350,48,{backgroundColor:"#17212b",strokeColor:"#17212b",strokeWidth:1});text(1535,cy+16,"✦  LET SAGE CHOOSE",9,{strokeColor:"#ffffff"});text(1835,cy+14,"→",14,{strokeColor:"#dfff58"});
    rect(1517,cy+60,350,64,{backgroundColor:"#ffffff",strokeColor:"#aeb7be",strokeWidth:1});text(1535,cy+72,"NEITHER?",8,{strokeColor:"#667085"});text(1535,cy+92,"Adjust direction & redraw",10);text(1837,cy+86,"↻",14,{strokeColor:"#ff7b67"});
  }
  function cityImage(x,y,w,h,mode="map"){
    rect(x,y,w,h,{backgroundColor:mode==="photo"?"#1b2a34":"#dceeff",strokeColor:"#17212b",strokeWidth:2});
    if(mode==="map"){
      for(let i=0;i<7;i++) line(x+25+i*72,y+15,[[0,0],[w*.18,h-30]],{strokeColor:i%2?"#89b7d8":"#aac9df",strokeWidth:2});
      for(let i=0;i<5;i++) line(x+15,y+25+i*53,[[0,0],[w-30,-20]],{strokeColor:"#9fc4de",strokeWidth:2});
      line(x+10,y+h*.62,[[0,0],[w*.28,-38],[w*.52,14],[w*.78,-28],[w-20,6]],{strokeColor:"#ff7b67",strokeWidth:5});
      ellipse(x+w*.5,y+h*.58,22,22,{backgroundColor:"#dfff58",strokeColor:"#17212b",strokeWidth:2});
    }else{
      rect(x,y+h*.72,w,h*.28,{backgroundColor:"#101820",strokeColor:"#101820",strokeWidth:1});
      const bw=[.08,.12,.09,.15,.1,.13,.07,.14,.1];let bx=x+15;bw.forEach((p,i)=>{const ww=w*p,hh=55+(i%4)*24;rect(bx,y+h*.72-hh,ww,hh,{backgroundColor:i%2?"#506675":"#334957",strokeColor:"#acd8ff",strokeWidth:1});for(let j=0;j<3;j++)ellipse(bx+10+j*18,y+h*.72-hh+18,5,5,{backgroundColor:"#ffd166",strokeColor:"#ffd166",strokeWidth:1});bx+=ww+8});
      ellipse(x+w*.77,y+35,74,74,{backgroundColor:"#dfff58",strokeColor:"#dfff58",strokeWidth:1});
    }
    rect(x+14,y+h-38,w-28,27,{backgroundColor:"#fffdf8",strokeColor:"#17212b",strokeWidth:1});text(x+25,y+h-30,mode==="photo"?"Civic archive district · sourced field image":"Memory map · archival overlays and contested landmarks",9);text(x+w-105,y+h-30,"SOURCE ↗",8,{strokeColor:"#1971c2"});
  }

  if(config.kind==="editorial"){
    text(60,264,"ANSWER / EDITORIAL",9,{strokeColor:"#667085"});
    text(60,291,"C",60);text(103,292,"ities remember in layers: through street names, buildings, archives, rituals,",18);text(103,322,"and the stories residents repeat. Official records preserve decisions, while",18);text(60,353,"everyday memory often survives in landmarks, local language, and contested public space.",18);cite(897,352,1);
    text(60,406,"What gets remembered is never neutral. A preserved courthouse, renamed avenue, or",18);text(60,436,"demolished neighborhood can all reveal who had the power to define the shared past.",18);cite(861,435,2);
    text(60,489,"Memory also lives outside institutions—in family stories, recurring festivals, protest routes,",18);text(60,519,"and informal names that persist long after an official map has changed.",18);cite(735,518,3);
    rect(60,567,1220,74,{backgroundColor:"#efffc4",strokeColor:"#17212b",strokeWidth:1});text(80,581,"WHERE THIS LEAVES US",8);text(80,603,"A city's memory is less like a vault and more like a negotiation that every generation quietly edits.",15);
    rect(1320,264,540,300,{backgroundColor:"#f4f1e9",strokeColor:"#17212b",strokeWidth:1});text(1342,284,"EVIDENCE AT A GLANCE",9,{strokeColor:"#d64b38"});text(1342,316,"01",12,{strokeColor:"#667085"});text(1380,312,"Municipal archives",13);text(1380,333,"official decisions · primary",9,{strokeColor:"#667085"});line(1342,357,[[0,0],[495,0]],{strokeColor:"#c8ced3",strokeWidth:1});text(1342,374,"02",12,{strokeColor:"#667085"});text(1380,370,"Historic preservation survey",13);text(1380,391,"built environment · institutional",9,{strokeColor:"#667085"});line(1342,415,[[0,0],[495,0]],{strokeColor:"#c8ced3",strokeWidth:1});text(1342,432,"03",12,{strokeColor:"#667085"});text(1380,428,"Oral-history collection",13);text(1380,449,"lived memory · community",9,{strokeColor:"#667085"});
    drawers(1320,580,540);bottom(790);
  }
  if(config.kind==="brief"){
    rect(58,262,1190,86,{backgroundColor:"#efffc4",strokeColor:"#17212b",strokeWidth:1});text(78,278,"SHORT ANSWER",8);text(78,301,"A city remembers through official records, physical places, and stories that communities keep alive.",18);cite(1125,301,1);
    text(58,380,"THREE FINDINGS",9,{strokeColor:"#667085"});
    const cards=[["01","Records","Laws, plans, archives, and names preserve the decisions a city made.","#e6f4ff"],["02","Places","Buildings and streets turn memory into something people encounter daily.","#fff1bf"],["03","Rituals","Stories, festivals, and protest routes preserve what institutions may omit.","#f3e8ff"]];
    cards.forEach(([num,t,copy,c],i)=>{const x=58+i*400;rect(x,406,375,174,{backgroundColor:c,strokeColor:"#17212b",strokeWidth:1});text(x+18,424,num,11,{strokeColor:"#667085"});text(x+18,453,t,21);text(x+18,489,copy,13);cite(x+333,538,i+1)});
    rect(1280,262,580,198,{backgroundColor:"#17212b",strokeColor:"#17212b",strokeWidth:1});text(1304,282,"WHAT REMAINS UNCERTAIN",9,{strokeColor:"#dfff58"});text(1304,316,"Whose memories are absent?",19,{strokeColor:"#fffdf8"});text(1304,351,"Official archives can document decisions",12,{strokeColor:"#bac3ca"});text(1304,374,"without capturing how those decisions felt",12,{strokeColor:"#bac3ca"});text(1304,397,"to displaced or marginalized residents.",12,{strokeColor:"#bac3ca"});
    rect(1280,478,580,82,{backgroundColor:"#ffded8",strokeColor:"#ff7b67",strokeWidth:1});text(1304,493,"CONFIDENCE",8,{strokeColor:"#d64b38"});text(1304,516,"High on the pattern · medium on local exceptions",13);
    drawers(1280,580,580);bottom(790);
  }
  if(config.kind==="split"){
    cityImage(58,262,750,350,"photo");
    text(850,264,"ANSWER / INTERPRETATION",9,{strokeColor:"#667085"});text(850,292,"The visible city is only",22);text(850,321,"one layer of its memory.",22);
    text(850,371,"Buildings, street names, and monuments make",14);text(850,397,"some histories easy to encounter. Other memories",14);text(850,423,"survive through oral accounts, local rituals, and",14);text(850,449,"the persistence of community names.",14);cite(1182,448,1);
    text(850,497,"The tension between those layers reveals who",14);text(850,523,"has been able to make memory public—and whose",14);text(850,549,"past must be actively recovered.",14);cite(1117,548,2);
    rect(1265,262,595,168,{backgroundColor:"#efffc4",strokeColor:"#17212b",strokeWidth:1});text(1287,280,"VISUAL READING",8);text(1287,309,"The skyline presents continuity.",17);text(1287,343,"The archive reveals replacement, renaming,",12);text(1287,367,"and the neighborhoods missing from view.",12);
    drawers(1265,452,595);bottom(790);
  }
  if(config.kind==="banner"){
    cityImage(58,260,1802,230,"map");
    text(58,515,"ANSWER",9,{strokeColor:"#667085"});text(58,541,"Cities remember through three overlapping systems: the official record, the built",16);text(58,569,"environment, and the stories residents continue to tell.",16);cite(717,568,1);
    line(940,520,[[0,0],[0,138]],{strokeColor:"#c2c9ce",strokeWidth:1});
    text(980,515,"WHY IT MATTERS",9,{strokeColor:"#d64b38"});text(980,541,"When these systems disagree, the gap becomes evidence:",16);text(980,569,"it shows which histories were protected and which required",16);text(980,597,"communities to preserve them outside official channels.",16);cite(1612,596,2);
    rect(58,624,1180,46,{backgroundColor:"#efffc4",strokeColor:"#17212b",strokeWidth:1});text(78,638,"TAKEAWAY",8);text(162,637,"Urban memory is an ongoing edit, not a finished archive.",13);
    drawers(1270,624,590);bottom(790);
  }
  // Template label, kept outside the product hierarchy but inside export.
  rect(1510,207,350,24,{backgroundColor:"#f4f1e9",strokeColor:"#aeb7be",strokeWidth:1});text(1522,213,`${config.title.toUpperCase()} · ${config.subtitle}`,7,{strokeColor:"#667085"});
  return E;
}

function svgFor(E){const esc=s=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f7f5ef"/><style>text{font-family:Arial,Helvetica,sans-serif}</style><defs><filter id="w"><feTurbulence baseFrequency=".014" numOctaves="1" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".45"/></filter></defs>`];for(const e of E){const fill=e.backgroundColor==="transparent"?"none":e.backgroundColor;if(e.type==="rectangle")out.push(`<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="${e.roundness?6:0}" fill="${fill}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}" ${e.strokeStyle==="dashed"?'stroke-dasharray="8 6"':""} filter="url(#w)"/>`);if(e.type==="ellipse")out.push(`<ellipse cx="${e.x+e.width/2}" cy="${e.y+e.height/2}" rx="${e.width/2}" ry="${e.height/2}" fill="${fill}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}" filter="url(#w)"/>`);if(e.type==="line"){const p=e.points.map(q=>`${e.x+q[0]},${e.y+q[1]}`).join(" ");out.push(`<polyline points="${p}" fill="none" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"/>`)}if(e.type==="text"){const ls=e.text.split("\n");out.push(`<text x="${e.x}" y="${e.y+e.fontSize}" fill="${e.strokeColor}" font-size="${e.fontSize}" font-weight="${e.fontSize>=22?600:500}">${ls.map((s,i)=>`<tspan x="${e.x}" dy="${i?e.fontSize*1.2:0}">${esc(s)}</tspan>`).join("")}</text>`)}}out.push("</svg>");return out.join("\n")}

fs.mkdirSync("design/content-templates",{recursive:true});const pngs=[];
for(const t of templates){const E=scene(t);const drawing={type:"excalidraw",version:2,source:"https://excalidraw.com",elements:E,appState:{gridSize:null,viewBackgroundColor:"#f7f5ef",currentItemFontFamily:5},files:{}};const stem=`design/content-templates/wonderdrive-content-${t.slug}`;fs.writeFileSync(`${stem}.excalidraw`,`${JSON.stringify(drawing,null,2)}\n`);const svg=svgFor(E);fs.writeFileSync(`${stem}.svg`,svg);await sharp(Buffer.from(svg)).png().toFile(`${stem}.png`);pngs.push(`${stem}.png`);console.log(`Created ${stem}.{excalidraw,svg,png}`)}
const thumbs=await Promise.all(pngs.map(p=>sharp(p).flatten({background:"#f7f5ef"}).resize(960,540).png().toBuffer()));await sharp({create:{width:1920,height:1080,channels:4,background:"#ece9e1"}}).composite(thumbs.map((input,i)=>({input,left:(i%2)*960,top:Math.floor(i/2)*540}))).flatten({background:"#ece9e1"}).png().toFile("design/content-templates/wonderdrive-content-template-contact-sheet.png");console.log("Created contact sheet");
