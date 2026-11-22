const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),axios=require('axios');
const id='507f1f77bcf86cd799439012';
const response=(quantity=1)=>({items:[{_id:'line',productId:id,product:{_id:id,title:'Item',price:10,priceAfterDiscount:10,images:[],category:null,stock:10},quantity,price:10,unitPriceCentavos:1000,lineTotalCentavos:1000*quantity,availableStock:10,available:true,issues:[]}],totalQuantity:quantity,subtotalCentavos:quantity*1000,checkoutEligible:true});
function harness(){
 let token=null,index=0;const states=[],refs=[],deps=[],memos=[],cleanups=[],effects=[],gets=[],mutations=[],navigation=[];
 const react={useState:initial=>{const i=index++;if(!(i in states))states[i]=initial;return[states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next}]},useRef:initial=>{const i=index++;return refs[i]||(refs[i]={current:initial})},useCallback:(fn,values)=>{const i=index++;if(!deps[i]||values.some((v,j)=>v!==deps[i][j])){deps[i]=values;memos[i]=fn}return memos[i]},useEffect:(effect,values)=>{const i=index++;if(!deps[i]||values.some((v,j)=>v!==deps[i][j])){cleanups[i]?.();deps[i]=values;effects.push(()=>{cleanups[i]=effect()})}}};
 const deferred=list=>(...args)=>new Promise((resolve,reject)=>list.push({args,resolve:data=>resolve({data}),reject}));
 const services={getCart:deferred(gets),addToCart:deferred(mutations),incrementQty:deferred(mutations),decrementQty:deferred(mutations),removeFromCart:deferred(mutations),clearCart:deferred(mutations)};
 const mapperExports={};const transpile=file=>ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../ecommerce-ts/src/'+file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(transpile('utils/cartMapper.ts'),{exports:mapperExports});
 const exports={};vm.runInNewContext(transpile('context/CartProvider.tsx'),{exports,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx:(type,props)=>({props})}:name==='axios'?axios:name==='react-hot-toast'?{default:{success(){},error(){}}}:name==='react-router-dom'?{useNavigate:()=>value=>navigation.push(value)}:name.includes('CartContext')?{CartContext:{Provider:'cart'}}:name.includes('useAuth')?{useAuth:()=>({token})}:name.includes('cartMapper')?mapperExports:name.includes('cartService')?services:{TOKEN_KEY:'cart-token'},localStorage:{getItem:()=>token}});
 const render=()=>{index=0;return exports.CartProvider({children:null}).props.value};const flush=async()=>{while(effects.length)effects.shift()();await new Promise(resolve=>setImmediate(resolve))};
 return{render,flush,gets,mutations,navigation,setToken:value=>{token=value}};
}
test('guest actions redirect; login hydrates and logout immediately hides cart',async()=>{
 const h=harness();await h.render().addToCart({_id:id},1);assert.deepEqual(h.navigation,['/login']);await h.flush();assert.equal(h.gets.length,0);
 h.setToken('session');h.render();await h.flush();assert.equal(h.gets.length,1);h.gets[0].resolve(response(2));await h.flush();assert.equal(h.render().totalQuantity,2);assert.equal(h.render().subtotalCentavos,2000);
 h.setToken(null);assert.equal(h.render().cartItems.length,0);await h.flush();assert.equal(h.render().checkoutEligible,false);
});
test('selected quantity is forwarded and duplicate mutations are blocked',async()=>{
 const h=harness();h.setToken('session');h.render();await h.flush();h.gets[0].resolve(response());await h.flush();
 const first=h.render().addToCart({_id:id},3);const duplicate=h.render().addToCart({_id:id},3);assert.equal(h.mutations.length,1);assert.equal(h.mutations[0].args[1],3);assert.equal(h.render().pending,true);
 h.mutations[0].resolve(response(4));await Promise.all([first,duplicate]);assert.equal(h.render().totalQuantity,4);assert.equal(h.render().pending,false);
});
test('late hydration and previous-session mutations cannot overwrite newer state',async()=>{
 const h=harness();h.setToken('session');h.render();await h.flush();
 const operation=h.render().addToCart({_id:id},2);h.mutations[0].resolve(response(2));await operation;h.gets[0].resolve(response(1));await h.flush();assert.equal(h.render().totalQuantity,2);
 const old=h.render().incrementQty(id);h.setToken(null);h.render();await h.flush();h.setToken('new-session');h.render();await h.flush();h.gets[1].resolve(response(5));await h.flush();h.mutations[1].resolve(response(3));await old;assert.equal(h.render().totalQuantity,5);
});
test('stock conflicts display refreshed authoritative cart data and disable checkout',async()=>{
 const h=harness();h.setToken('session');h.render();await h.flush();h.gets[0].resolve(response());await h.flush();
 const operation=h.render().incrementQty(id);const cart={...response(),checkoutEligible:false};
 h.mutations[0].reject(new axios.AxiosError('conflict',undefined,undefined,undefined,{status:409,data:{message:'Only 1 currently available.',cart}}));await operation;
 assert.match(h.render().error,/Only 1/);assert.equal(h.render().totalQuantity,1);assert.equal(h.render().checkoutEligible,false);
});
