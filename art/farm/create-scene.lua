-- Original layered Ignis farm. Coordinates match the interactive web map.
local sprite = Sprite(256,128,ColorMode.RGB)
local colors = {
 sky={31,34,40}, ground={31,34,40}, panel={43,51,71}, shade={54,64,85},
 edge={133,146,170}, light={239,240,246}, accent={232,132,164}
}
local image
local function pixel(x,y,color)
 if x>=0 and y>=0 and x<256 and y<128 then local c=colors[color]; image:drawPixel(x,y,app.pixelColor.rgba(c[1],c[2],c[3],255)) end
end
local function rect(x,y,w,h,color) for yy=y,y+h-1 do for xx=x,x+w-1 do pixel(xx,yy,color) end end end
local function polygon(points,color)
 for y=0,127 do
  local nodes={}
  for i=1,#points do local a=points[i]; local b=points[i%#points+1]; if (a[2]<=y and b[2]>y) or (b[2]<=y and a[2]>y) then nodes[#nodes+1]=a[1]+(y-a[2])*(b[1]-a[1])/(b[2]-a[2]) end end
  table.sort(nodes)
  for i=1,#nodes-1,2 do for x=math.ceil(nodes[i]),math.floor(nodes[i+1]) do pixel(x,y,color) end end
 end
end
local function layer(name,first)
 local current = first and sprite.layers[1] or sprite:newLayer()
 current.name=name; image=Image(256,128,ColorMode.RGB); image:clear()
 if first then sprite.cels[1].image=image else sprite:newCel(current,1,image,Point(0,0)) end
 -- Return a finalizer because newCel copies its image.
 return function() sprite:newCel(current,1,image,Point(0,0)) end
end
-- Crisp one-pixel outlines and large quiet fills, inspired by the console reference.
local function line(x0,y0,x1,y1,key)
 local dx,dy=math.abs(x1-x0),math.abs(y1-y0)
 local sx,sy=x0<x1 and 1 or -1,y0<y1 and 1 or -1
 local err=dx-dy
 while true do
  pixel(x0,y0,key);if x0==x1 and y0==y1 then break end
  local e=2*err;if e>-dy then err=err-dy;x0=x0+sx end;if e<dx then err=err+dx;y0=y0+sy end
 end
end
local function box(x,y,w,h,fill,edge)
 rect(x,y,w,h,fill);line(x,y,x+w-1,y,edge);line(x,y+h-1,x+w-1,y+h-1,edge)
 line(x,y,x,y+h-1,edge);line(x+w-1,y,x+w-1,y+h-1,edge)
end
local function shape(points,fill,edge)
 polygon(points,fill)
 for i,a in ipairs(points) do local b=points[i%#points+1];line(a[1],a[2],b[1],b[2],edge) end
end
local finish=layer('01 Sky',true)
rect(0,0,256,128,'sky');finish()
finish=layer('02 Landscape')
rect(0,65,256,63,'ground')
line(0,70,256,70,'shade')
-- Widely spaced ground pixels; no grass texture competing with the plants.
for _,p in ipairs({{8,82},{34,73},{82,79},{162,74},{211,85},{231,96},{14,119},{89,121},{164,124}}) do rect(p[1],p[2],1,1,'edge') end
box(18,47,5,23,'panel','edge');box(224,42,4,28,'panel','edge');finish()
finish=layer('Tree canopies')
shape({{2,34},{5,34},{5,26},{10,26},{10,20},{17,20},{17,16},{27,16},{27,20},{34,20},{34,26},{39,26},{39,34},{42,34},{42,43},{37,43},{37,48},{8,48},{8,44},{2,44}},'panel','edge')
line(11,25,18,25,'light');line(18,21,26,21,'light');line(7,36,7,40,'light')
line(22,36,22,47,'edge');line(15,34,22,41,'edge');line(29,33,22,41,'edge')
shape({{226,8},{237,24},{232,24},{244,40},{237,40},{250,56},{204,56},{216,40},{210,40},{221,24},{216,24}},'panel','edge')
line(225,14,220,22,'light');line(222,28,217,36,'light');line(217,44,210,53,'light')
line(225,39,233,39,'edge');line(221,55,232,55,'light');finish()
finish=layer('03 Cottage')
box(110,32,38,25,'panel','light')
shape({{104,32},{115,19},{137,19},{153,32}},'panel','light')
line(112,29,144,29,'edge')
box(139,10,5,15,'panel','edge');line(138,9,145,9,'light')
box(124,39,10,18,'ground','light');rect(131,47,1,1,'accent')
for _,x in ipairs({114,137}) do box(x,38,6,8,'shade','light');line(x+2,39,x+2,44,'edge');line(x,42,x+5,42,'edge') end
box(121,57,16,4,'panel','edge');line(119,62,139,62,'light')
-- A small pink pennant provides a landmark without filling the scene with color.
line(126,10,126,18,'edge');rect(127,10,5,3,'accent');finish()
finish=layer('04 Paths and fence')
rect(0,81,256,12,'panel');line(0,81,256,81,'shade');line(0,93,256,93,'shade')
rect(120,63,16,35,'panel');line(120,65,120,80,'shade');line(136,65,136,80,'shade')
for y=67,77,7 do line(124,y,132,y,'edge') end
for y=95,98,3 do line(124,y,132,y,'edge') end
-- Clean fence segments keep the walking lane visibly open.
for _,segment in ipairs({{0,38},{79,108},{158,173},{209,255}}) do
 local a,b=segment[1],segment[2];line(a,61,b,61,'edge');line(a,66,b,66,'edge')
 for x=a,b,12 do box(x,58,3,12,'panel','edge') end
end
finish()
finish=layer('05 Planting beds')
for i=0,2 do local x=24+i*76
 box(x,99,56,20,'panel','edge');line(x+1,99,x+54,99,'light')
 for row=0,2 do line(x+4,103+row*5,x+51,103+row*5,'shade') end
 box(x+22,120,12,5,'panel','edge');rect(x+24,122,8,1,'light')
end
finish()
finish=layer('06 Pond and tools')
shape({{242,105},{255,105},{255,127},{236,127},{233,120},{236,110}},'panel','edge')
line(242,112,251,112,'light');line(239,120,247,120,'edge')
box(5,94,16,8,'panel','light');line(6,96,19,96,'edge');line(20,94,26,91,'edge')
box(231,50,13,15,'panel','edge');line(231,54,243,54,'light');line(231,60,243,60,'edge');finish()
finish=layer('07 Flowers and grass')
for _,p in ipairs({{7,74},{78,72},{162,76},{218,74},{10,122},{90,125}}) do
 local x,y=p[1],p[2];line(x,y,x,y+3,'edge');rect(x-1,y-1,3,2,'light');pixel(x,y-1,'accent')
end
finish()
finish=layer('08 Kitchen and training yard')
box(44,35,29,20,'panel','light')
shape({{40,35},{48,26},{65,26},{76,35}},'panel','light')
box(45,20,4,10,'panel','edge');line(44,19,50,19,'light')
box(56,42,7,13,'ground','light');box(47,41,6,7,'shade','light');line(48,44,51,44,'edge')
rect(60,48,1,1,'accent');line(54,56,66,56,'edge')
box(176,43,28,11,'panel','edge');line(177,44,202,44,'light')
box(180,34,4,13,'panel','light');box(197,34,4,13,'panel','light');line(184,38,197,38,'light')
rect(179,33,6,3,'edge');rect(196,33,6,3,'edge')
box(148,39,9,13,'panel','light');rect(150,44,5,1,'accent');rect(152,42,1,5,'accent');finish()
sprite:saveAs(app.params.source)
-- Export static scenery and canopy independently for wind animation.
local trees
for _,current in ipairs(sprite.layers) do
 if current.name=='01 Sky' or current.name=='Tree canopies' then current.isVisible=false end
 if current.name=='Tree canopies' then trees=current end
end
sprite:saveCopyAs(app.params.export)
if app.params.trees then
 for _,current in ipairs(sprite.layers) do current.isVisible=(current==trees) end
 sprite:saveCopyAs(app.params.trees)
end
for _,current in ipairs(sprite.layers) do current.isVisible=true end
