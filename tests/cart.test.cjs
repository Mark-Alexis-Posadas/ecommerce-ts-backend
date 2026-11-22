require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Types}=require('mongoose');
const Cart=require('../src/models/cart.model').default;
const {mutateCart,readCart,cartRepository,prepareCartForCheckout,cartDependencies}=require('../src/services/cart.service');
const {effectivePriceCentavos}=require('../src/services/cartPricing');
const {lowStockThreshold}=require('../src/config/inventory');
const user='507f1f77bcf86cd799439011',other='507f1f77bcf86cd799439099',id='507f1f77bcf86cd799439012',category='507f1f77bcf86cd799439013';
const oid=value=>new Types.ObjectId(value);

// In-memory, atomic test double. This is NOT a real-Mongo concurrency test.
function harness(){
 const carts=new Map();let initializations=0;let writes=0;let conflicts=0;
 const product={_id:oid(id),title:'Product',category:oid(category),stock:20,price:19.99,discount:10,images:['/image.png']};
 const clone=cart=>({...cart,items:cart.items.map(item=>({...item}))});
 const repository={
  find:async owner=>carts.has(owner)?[clone(carts.get(owner))]:[],
  initialize:async owner=>{initializations++;if(carts.has(owner))throw{code:11000};carts.set(owner,{_id:oid(owner),user:oid(owner),items:[],__v:0})},
  compareSwap:async(snapshot,items)=>{const current=carts.get(String(snapshot.user));if(!current||current.__v!==snapshot.__v){conflicts++;return false}carts.set(String(snapshot.user),{...current,items:items.map(item=>({...item})),__v:current.__v+1});writes++;return true},
 };
 let active=true;let exists=true;
 const dependencies={repository,catalog:async()=>({products:exists?[product]:[],activeCategoryIds:active?[category]:[]})};
 return {dependencies,carts,product,setActive:value=>active=value,setExists:value=>exists=value,stats:()=>({initializations,writes,conflicts})};
}
const add=(quantity=1)=>({type:'add',productId:id,quantity});

test('invalid IDs and quantities fail before persistence',async()=>{
 for(const quantity of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'2',undefined]){
  const h=harness();await assert.rejects(mutateCart(user,{type:'add',productId:id,quantity},h.dependencies),/Quantity/);assert.equal(h.stats().writes,0);
 }
 const h=harness();await assert.rejects(mutateCart(user,{type:'remove',productId:'bad'},h.dependencies),/Invalid product ID/);
});
test('nonexistent, archived, inactive-category and out-of-stock products are rejected',async()=>{
 for(const configure of [h=>h.setExists(false),h=>h.product.isActive=false,h=>h.setActive(false),h=>h.product.stock=0]){
  const h=harness();configure(h);await assert.rejects(mutateCart(user,add(),h.dependencies),error=>[404,409].includes(error.status));assert.equal(h.stats().writes,0);
 }
});
test('combined quantities cannot exceed currently read stock',async()=>{
 const h=harness();h.product.stock=3;await mutateCart(user,add(2),h.dependencies);
 await assert.rejects(mutateCart(user,add(2),h.dependencies),error=>error.code==='INSUFFICIENT_STOCK');
 const cart=await readCart(user,h.dependencies);assert.equal(cart.items[0].quantity,2);assert.equal(cart.items.length,1);
});
test('concurrent initialization and increments preserve one cart and every accepted update',async()=>{
 const h=harness();await Promise.all([readCart(user,h.dependencies),readCart(user,h.dependencies),readCart(user,h.dependencies)]);assert.equal(h.carts.size,1);
 await Promise.all([mutateCart(user,add(),h.dependencies),mutateCart(user,add(),h.dependencies),mutateCart(user,add(),h.dependencies)]);
 const cart=await readCart(user,h.dependencies);assert.equal(cart.items.length,1);assert.equal(cart.items[0].quantity,3);assert.ok(h.stats().conflicts>0);
});
test('stock ceiling is rechecked after concurrent cart conflicts',async()=>{
 const h=harness();h.product.stock=1;
 const results=await Promise.allSettled([mutateCart(user,add(),h.dependencies),mutateCart(user,add(),h.dependencies)]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal((await readCart(user,h.dependencies)).totalQuantity,1);
});
test('increment, decrement-to-zero, removal and clear are scoped to the owner',async()=>{
 const h=harness();await mutateCart(user,add(),h.dependencies);await mutateCart(other,add(3),h.dependencies);
 await mutateCart(user,{type:'increment',productId:id},h.dependencies);assert.equal((await readCart(user,h.dependencies)).totalQuantity,2);
 await mutateCart(user,{type:'decrement',productId:id},h.dependencies);await mutateCart(user,{type:'decrement',productId:id},h.dependencies);assert.equal((await readCart(user,h.dependencies)).items.length,0);
 await mutateCart(user,add(),h.dependencies);h.product.isActive=false;await mutateCart(user,{type:'remove',productId:id},h.dependencies);assert.equal((await readCart(user,h.dependencies)).items.length,0);
 h.product.isActive=true;await mutateCart(user,add(),h.dependencies);await mutateCart(user,{type:'clear'},h.dependencies);
 assert.equal((await readCart(other,h.dependencies)).totalQuantity,3);
});
test('current prices, free discounts, integer centavos and stored-price distrust',async()=>{
 assert.equal(effectivePriceCentavos(1.005),101);assert.equal(effectivePriceCentavos(0.29),29);assert.equal(effectivePriceCentavos(123.45,100),0);
 const h=harness();await mutateCart(user,add(3),h.dependencies);h.product.price=0.29;h.product.discount=0;
 h.carts.get(user).items[0].price=99999;
 let cart=await readCart(user,h.dependencies);assert.equal(cart.items[0].unitPriceCentavos,29);assert.equal(cart.subtotalCentavos,87);assert.equal(cart.subtotal,0.87);
 h.product.discount=100;cart=await readCart(user,h.dependencies);assert.equal(cart.subtotalCentavos,0);assert.equal(cart.checkoutEligible,true);
});
test('stock changes and missing products remain visible, invalid and removable',async()=>{
 const h=harness();await mutateCart(user,add(3),h.dependencies);h.product.stock=1;
 let cart=await readCart(user,h.dependencies);assert.equal(cart.checkoutEligible,false);assert.equal(cart.items[0].availableStock,1);assert.ok(cart.issues.some(issue=>issue.code==='INSUFFICIENT_STOCK'));
 await mutateCart(user,{type:'decrement',productId:id},h.dependencies);h.setExists(false);cart=await readCart(user,h.dependencies);
 assert.equal(cart.items.length,1);assert.equal(cart.items[0].product,null);assert.equal(cart.totalQuantity,2);assert.equal(cart.items[0].price,null);
 await mutateCart(user,{type:'remove',productId:id},h.dependencies);assert.equal((await readCart(user,h.dependencies)).items.length,0);
});
test('legacy duplicate carts are blocked without merge or deletion',async()=>{
 const h=harness();await readCart(user,h.dependencies);const existing=h.carts.get(user);h.dependencies.repository.find=async()=>[existing,existing];
 await assert.rejects(readCart(user,h.dependencies),error=>error.code==='DUPLICATE_CARTS');assert.equal(h.stats().writes,0);
});
test('duplicate lines and invalid legacy quantities are reported; clearing remains available',async()=>{
 const h=harness();await mutateCart(user,add(),h.dependencies);const raw=h.carts.get(user);raw.items.push({...raw.items[0]});
 let cart=await readCart(user,h.dependencies);assert.equal(cart.checkoutEligible,false);assert.ok(cart.issues.some(issue=>issue.code==='DUPLICATE_PRODUCT'));
 await assert.rejects(mutateCart(user,add(),h.dependencies),error=>error.code==='DUPLICATE_PRODUCT');await mutateCart(user,{type:'remove',productId:id},h.dependencies);
 raw.items=[{product:oid(id),quantity:-1,price:10}];h.carts.set(user,raw);cart=await readCart(user,h.dependencies);assert.ok(cart.issues.some(issue=>issue.code==='INVALID_QUANTITY'));
 await mutateCart(user,{type:'clear'},h.dependencies);assert.equal((await readCart(user,h.dependencies)).items.length,0);
});
test('unsafe monetary totals never become checkout eligible',async()=>{
 const h=harness();h.product.price=1e12;h.product.stock=Number.MAX_SAFE_INTEGER;
 await mutateCart(user,add(Number.MAX_SAFE_INTEGER),h.dependencies);const cart=await readCart(user,h.dependencies);
 assert.equal(cart.checkoutEligible,false);assert.ok(cart.issues.some(issue=>issue.code==='INVALID_PRICE'));
});
test('Mongo write shapes use deterministic initialization and owner/version compare-and-swap',async()=>{
 const original=Cart.updateOne;const calls=[];Cart.updateOne=async(...args)=>{calls.push(args);return{matchedCount:1}};
 try{
  await cartRepository.initialize(user);assert.deepEqual(calls[0][0],{_id:user,user});assert.equal(calls[0][2].upsert,true);
  await cartRepository.compareSwap({_id:oid(user),user:oid(user),__v:4,items:[]},[]);
  assert.equal(String(calls[1][0].user),user);assert.equal(calls[1][0].__v,4);assert.deepEqual(calls[1][1].$inc,{__v:1});assert.equal(calls[1][2].runValidators,true);
  assert.equal(Cart.schema.options.autoIndex,false);assert.ok(Cart.schema.indexes().some(([keys,options])=>keys.user===1&&options.unique));
 }finally{Cart.updateOne=original}
});
test('configurable low-stock threshold falls back safely',()=>{
 const previous=process.env.INVENTORY_LOW_STOCK_THRESHOLD;
 try{delete process.env.INVENTORY_LOW_STOCK_THRESHOLD;assert.equal(lowStockThreshold(),5);process.env.INVENTORY_LOW_STOCK_THRESHOLD='9';assert.equal(lowStockThreshold(),9);process.env.INVENTORY_LOW_STOCK_THRESHOLD='-1';assert.equal(lowStockThreshold(),5)}finally{if(previous===undefined)delete process.env.INVENTORY_LOW_STOCK_THRESHOLD;else process.env.INVENTORY_LOW_STOCK_THRESHOLD=previous}
});
test('checkout preparation rejects bad quantities/stock and uses current integer-cent totals',async()=>{
 const h=harness();await mutateCart(user,add(2),h.dependencies);h.product.stock=1;
 await assert.rejects(prepareCartForCheckout(user,h.dependencies),error=>error.code==='INVALID_CART');
 h.product.stock=10;h.carts.get(user).items[0].quantity=-1;
 await assert.rejects(prepareCartForCheckout(user,h.dependencies),error=>error.code==='INVALID_CART');
 h.carts.get(user).items[0].quantity=2;h.carts.get(user).items[0].price=9999;h.product.price=0.29;h.product.discount=0;
 const prepared=await prepareCartForCheckout(user,h.dependencies);assert.equal(prepared.cart.subtotalCentavos,58);assert.equal(prepared.orderItems[0].price,0.29);
});
test('HTTP cart validation, authorization, consistent responses and user isolation',async()=>{
 const h=harness();const original={repository:cartDependencies.repository,catalog:cartDependencies.catalog};
 const User=require('../src/models/user.model').default;const originalFind=User.findById;
 const jwt=require('jsonwebtoken');process.env.JWT_SECRET=require('node:crypto').randomBytes(32).toString('hex');
 User.findById=id=>({select:async()=>({_id:id,name:'Test',email:'test@example.test',role:'customer'})});
 cartDependencies.repository=h.dependencies.repository;cartDependencies.catalog=h.dependencies.catalog;
 const app=require('../src/app').default;const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const request=(method,path,body,owner=user)=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json',...(owner?{Authorization:'Bearer '+jwt.sign({id:owner},process.env.JWT_SECRET,{expiresIn:'1h'})}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await request('POST','/api/cart',{productId:id,quantity:1},null)).status,401);
  for(const body of [{productId:'bad',quantity:1},{productId:id,quantity:0},{productId:id,quantity:'1'},{productId:id,quantity:1,price:0}])assert.equal((await request('POST','/api/cart',body)).status,400);
  const added=await request('POST','/api/cart',{productId:id,quantity:2});assert.equal(added.status,200);const cart=await added.json();assert.equal(cart.currency,'PHP');assert.equal(cart.totalQuantity,2);assert.equal(cart.checkoutEligible,true);
  const otherCart=await(await request('GET','/api/cart',null,other)).json();assert.equal(otherCart.items.length,0);
  h.product.stock=2;assert.equal((await request('PUT','/api/cart/increment',{productId:id})).status,409);
  await request('PUT','/api/cart/decrement',{productId:id});assert.equal((await(await request('GET','/api/cart')).json()).totalQuantity,1);
  h.product.isActive=false;assert.equal((await request('DELETE','/api/cart/'+id)).status,200);
  assert.equal((await(await request('DELETE','/api/cart')).json()).items.length,0);
 }finally{Object.assign(cartDependencies,original);User.findById=originalFind;server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
