-- Original limited-palette 16x24 girl, bangs, no hat; dark outfit and four walk frames.
local sprite = Sprite(16, 24, ColorMode.RGB)
local layer = sprite.layers[1]
layer.name = 'Farmer'
local palette = {
 h=app.pixelColor.rgba(133,146,170,255), a=app.pixelColor.rgba(200,209,226,255),
 s=app.pixelColor.rgba(239,240,246,255), l=app.pixelColor.rgba(239,240,246,255),
 b=app.pixelColor.rgba(133,146,170,255), r=app.pixelColor.rgba(43,51,71,255),
 m=app.pixelColor.rgba(43,51,71,255), p=app.pixelColor.rgba(232,132,164,255), d=app.pixelColor.rgba(31,34,40,255)
}
local body = {
 '................',
 '.....hhhhhh.....',
 '....haaaahhh....',
 '...hhaaaahhhh...',
 '...hhahhahhhh...',
 '...hhllhlllhh...',
 '...hhldlldlhh...',
 '...hhllllllhh...',
 '...hhslmmlshh...',
 '...hhhsssshhh...',
 '....hrrrrrrh....',
 '...shrbrrbrhs...',
 '...slrbbbbrrls..',
 '...slrbbbbrrls..',
 '...ssrpppprss...',
 '.....bbbbbb.....',
 '.....bbbbbb.....',
 '.....bbbbbb.....',
}
for frame=1,4 do
  if frame > 1 then sprite:newEmptyFrame(frame) end
  local image = Image(16,24,ColorMode.RGB)
  image:clear()
  for y,row in ipairs(body) do
    for x=1,#row do local color=palette[row:sub(x,x)]; if color then image:drawPixel(x-1,y-1,color) end end
  end
  local legs = frame == 2 and {'.....bbb.bb.....','.....ddd.bb.....','.........dd.....'} or frame == 4 and {'.....bb.bbb.....','.....bb.ddd.....','.....dd.........'} or {'.....bb.bb......','.....dd.dd......','.....dd.dd......'}
  for i,row in ipairs(legs) do for x=1,#row do local color=palette[row:sub(x,x)]; if color then image:drawPixel(x-1,17+i,color) end end end
  if frame == 1 then sprite.cels[1].image = image else sprite:newCel(layer,frame,image,Point(0,0)) end
  sprite.frames[frame].duration = 0.14
end
sprite:saveAs(app.params.source)
