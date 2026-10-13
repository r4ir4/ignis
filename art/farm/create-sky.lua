-- Original transparent cloud layer, tinted by the live farm lighting.
local sprite=Sprite(256,128,ColorMode.RGB)
sprite.layers[1].name='Layered pixel clouds'
local image=Image(256,128,ColorMode.RGB);image:clear()
local colors={cream={200,209,226}, light={133,146,170}, shadow={43,51,71}, edge={133,146,170}}
local function rect(x,y,w,h,key)
 local c=colors[key];local value=app.pixelColor.rgba(c[1],c[2],c[3],255)
 for yy=y,y+h-1 do for xx=x,x+w-1 do if xx>=0 and xx<256 and yy>=0 and yy<128 then image:drawPixel(xx,yy,value) end end end
end
local function cloud(x,y)
 rect(x,y+6,27,1,'light');rect(x+3,y+3,1,3,'light');rect(x+4,y+2,7,1,'light')
 rect(x+11,y,8,1,'cream');rect(x+19,y+1,1,3,'light');rect(x+20,y+4,6,1,'light')
 rect(x+27,y+5,1,2,'light');rect(x+8,y+9,14,1,'shadow')
end
cloud(9,8);cloud(163,15)
rect(76,27,12,1,'light');rect(79,25,6,1,'light')
sprite.cels[1].image=image
sprite:saveAs(app.params.source)
sprite:saveCopyAs(app.params.export)
