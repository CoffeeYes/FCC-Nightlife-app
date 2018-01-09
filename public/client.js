$(document).on("click",".click-going",function() {
  var bar_name = ($(this).parent().find(".bar_name").text());
  //post data to backend when user clicks a going button
  $.post("/click-going",{bar_name: bar_name});
  //refresh the page to show change
  setTimeout(function(){
    location.reload()
  },200)
  
})
