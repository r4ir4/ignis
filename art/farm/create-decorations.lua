-- Three optional cosmetic sprites, unlocked from existing progress.
local sprite=Sprite(16,16,ColorMode.RGB)
local layer=sprite.layers[1];layer.name='Decorations'
local images={
 {'................','......bbbb......','.....bbbbbb.....','......bb........','.....yyyyyy.....','.....yooooy.....','.....yooooy.....','.....yooooy.....','.....yyyyyy.....','......bbbb......','................'},
 {'...bb...........','...bbrrrrrrr....','...bbrrrrrrr....','...bbrrrrrr.....','...bbrrrrr......','...bbrrrrrr.....','...bbrrrrrrr....','...bb...........','...bb...........','...bb...........','...bb...........','...bb...........'},
 {'................','.....p..........','....pyp.........','.....p.....p....','.....g....pyp...','...ggg.....p....','.....g.....g....','..........ggg...','...........g....','................'}
}
local colors={b=app.pixelColor.rgba(65,65,65,255),r=app.pixelColor.rgba(232,132,164,255),y=app.pixelColor.rgba(190,190,190,255),o=app.pixelColor.rgba(235,235,235,255),p=app.pixelColor.rgba(235,235,235,255),g=app.pixelColor.rgba(100,100,100,255)}
for frame,rows in ipairs(images) do
 if frame>1 then sprite:newEmptyFrame(frame) end
 local image=Image(16,16,ColorMode.RGB);image:clear()
 for y,row in ipairs(rows) do for x=1,#row do local color=colors[row:sub(x,x)];if color then image:drawPixel(x-1,y-1,color) end end end
 if frame==1 then sprite.cels[1].image=image else sprite:newCel(layer,frame,image,Point(0,0)) end
end
sprite:saveAs(app.params.source)
