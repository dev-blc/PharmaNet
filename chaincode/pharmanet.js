'use strict'

const { Contract } = require('fabric-contract-api');
const ClientIdentity = require('fabric-shim').ClientIdentity;

class pharmanet extends Contract {

    constructor(){
        super('org.pharma-network.pharmanet');
        let hKey = 0;
    }
    //Instantiate Function
    async instantiate(ctx){
        console.log('**Pharma Net Chaincode Instantiated**');
    }


    //Entity Registration
    /**
	* @function registerCompany
	* @decription This function is used to register new entities on the ledger.
	*
	* @param ctx
    * @param companyCRN - Company Registration Number
    * @param companyName - Name of the company
    * @param companyLocation - Location of the company
    * @param organisationRole - Role of the company (Only these 4 - Manufacturer/distributor/Retailer/Transporter)
	*
	* @returns Company Object
	**/
    async registerCompany (ctx, companyCRN, companyName, companyLocation, organisationRole){
        /** to check before final
         * No hiererchy for transporters
         * restrict access for consumer
         */
        //OrganisationRole value check
        if(organisationRole !== "Manufacturer" && organisationRole !== "distributor" && organisationRole !== "Retailer" && organisationRole !== "Transporter")
        {   throw new Error('INVALID ROLE!! Enter either one of the below - Manufacturer/distributor/Retailer/Transporter');    }
        //Switch case
        let hKey = 0;
        switch (organisationRole) {
            case "Manufacturer":
                hKey = 1;
                break;
            case "distributor":
                hKey = 2;
                break;
            case "Retailer":
                hKey = 3;
                break;
            case "Transporter":
                break;
            default:
                throw new Error('INVALID ROLE!! Enter either one of the below - Manufacturer/distributor/Retailer/Transporter');
        }

        //Composite key
        const companyKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [companyCRN]);
        let companyBuffer = await ctx.stub.getState(companyKey).catch(err => console.log(err));

        //Verify if company already exists
        if(companyBuffer.length === 0){
            //Create a company object
            let companyObject = {
                companyID: companyCRN + '-' + companyName,
                name: companyName,
                location: companyLocation,
                organisationRole: organisationRole,
                hierarchyKey: hKey,
            };
            let dataBuffer = Buffer.from(JSON.stringify(companyObject));
            await ctx.stub.putState(companyKey, dataBuffer);
            return companyObject;
        }
        else{
            throw new Error('Company Already Exists');
        }
    }

    //Drug Registration
    /**
	* @function addDrug
	* @decription This function is used by Manufacturer to register new drug on the ledger.
	*
	* @param ctx
    * @param drugName - Name of the drug
    * @param serialNo - Serial No of the drug
    * @param mfgDate - Manufactred date
    * @param expDate - Expiry date
    * @param companyCRN - Company Registration Number
	*
	* @returns Drug Object
	**/
    async addDrug(ctx, drugName, serialNo, mfgDate, expDate, companyCRN){
      const cid = new ClientIdentity(ctx.stub);
      const userCert = cid.getX509Certificate();
        if(userCert.issuer.organizationName === "manufacturer.pharma-network.com"){
            const drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug', [drugName + '-' + serialNo]);
            let drugBuffer = await ctx.stub.getState(drugKey).catch(err => console.log(err));
            let companyKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [companyCRN]);
            //Verify if company already exists
            if(drugBuffer.length === 0){
                //Create a company object
                let drugObject = {
                    productID: drugKey, //drugName + '_' + serialNo,
                    name: drugName,
                    manufacturer: companyKey,
                    manufacturingDate: mfgDate,
                    expiryDate: expDate,
                    owner: companyKey,
                    shipment: [],
                };
                let dataBuffer = Buffer.from(JSON.stringify(drugObject));
                await ctx.stub.putState(drugKey, dataBuffer);
                return drugObject;
            }
            else{
                throw new Error('Drug Already Exists');
            }
        }
        else{
            throw new Error('******** Manufacturer Only Access ********');
        }
    }

    //Transfer Drug
    /**
	* @function createPO
	* @decription This function is used by distributor/Retailer to create a new purchase order.
	*
	* @param ctx
    * @param buyerCRN - CRN of the buyer
    * @param sellerCRN - CRN of the seller
    * @param drugName - Name of the drug
    * @param quantity - Quantity
	*
	* @returns Order Object
	**/
    async createPO(ctx, buyerCRN, sellerCRN, drugName, quantity){
      const cid = new ClientIdentity(ctx.stub);
      const userCert = cid.getX509Certificate();
        if (userCert.issuer.organizationName === "distributor.pharma-network.com" || userCert.issuer.organizationName === "retailer.pharma-network.com"){
            const poKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.order', [buyerCRN + '-' + drugName]);
            let poBuffer = await ctx.stub.getState(poKey).catch(err => console.log(err));
            let buyerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [buyerCRN]);
            let sellerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [sellerCRN]);
            //Verify buyer and seller
            let buyerBuffer = await ctx.stub.getState(buyerKey).catch(err => console.log(err));
            let buyer = JSON.parse(buyerBuffer.toString());
            let sellerBuffer = await ctx.stub.getState(sellerKey).catch(err => console.log(err));
            let seller = JSON.parse(sellerBuffer.toString());
            if(buyerBuffer.length !== 0 && sellerBuffer.length !== 0){
                if(buyer.hierarchyKey !== seller.hierarchyKey + 1){
                    throw new Error('You cant purchase from this buyer. Please follow the hierarchy')
                }
            }
            else{
                throw new Error('Enter Valid Buyer/Seller Data')
            }
            //Verify if company already exists
            if(poBuffer.length === 0){
                //Create a company object
                let poObject = {
                    poID: poKey,
                    name: drugName,
                    quantity: quantity,
                    buyer: buyerKey,
                    seller: sellerKey,
                };
                let dataBuffer = Buffer.from(JSON.stringify(poObject));
                await ctx.stub.putState(poKey, dataBuffer);
                return poObject;
            }
            else{
                throw new Error('Purchase Order Exists!!');
            }
        }
        else{
            throw new Error('******** Only distributor & Retailer can Access ********');
        }
    }

    /**
	* @function createShipment
	* @decription This function is used by seller to transport the  purchase order.
	*
	* @param ctx
    * @param buyerCRN - CRN of the buyer
    * @param drugName - Name of the drug
    * @param listOfAssets - Quantity of shipment
    * @param transporterCRN - CRN of the transporter
	*
	* @returns Shipment Object
	**/
    async createShipment(ctx, buyerCRN, drugName, listOfAssets, transporterCRN){
      const cid = new ClientIdentity(ctx.stub);
      const userCert = cid.getX509Certificate();
        if(userCert.issuer.organizationName === "distributor.pharma-network.com" || userCert.issuer.organizationName === "manufacturer.pharma-network.com"){
            const shipmentKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.shipment', [buyerCRN + '-' + drugName]);
            let shipmentBuffer = await ctx.stub.getState(shipmentKey).catch(err => console.log(err));
            //Buyer
            let buyerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [buyerCRN]);
            let buyerBuffer = await ctx.stub.getState(buyerKey).catch(err => console.log(err));
            let buyer = JSON.parse(buyerBuffer.toString());
            //Transporter
            let transporterKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [transporterCRN]);
            let transporterBuffer = await ctx.stub.getState(transporterKey).catch(err => console.log(err));
            let transporter = JSON.parse(transporterBuffer.toString());
            //Assets length === quantity
            const poKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.order', [buyerCRN + '-' + drugName]);
            let poBuffer = await ctx.stub.getState(poKey).catch(err => console.log(err));
            let po = JSON.parse(poBuffer.toString());
            let assetList=listOfAssets.split(",");
            if(poBuffer.length !== 0){
                if(po.quantity != assetList.length){

                    throw new Error('Not correct quantity'+assetList.length +'/'+po.quantity);
                }
            }
            else{
                throw new Error('Purchase Order does not exist');
            }
            //Verify if Shipment already exists
            if(shipmentBuffer.length === 0){
                //Create a company object
                let shipmentObject = {
                    shipmentID: shipmentKey,
                    creator: po.seller,
                    assets: assetList,
                    transporter: transporterKey,
                    status: "In-Transit",
                };
                //Owner Update
                let len=assetList.length;
                for (let i = 0; i<len; i++){
                    let drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug',[drugName + '-' +assetList[i]]);
                    let drugBuffer = await ctx.stub.getState(drugKey).catch(err => console.log(err));
                    //throw new Error(drugKey+'///' + drugBuffer);
                    let drug = JSON.parse(drugBuffer.toString());
                    if(drugBuffer.length !== 0){
                        drug.owner = transporterKey;
                        let dataBuffer = Buffer.from(JSON.stringify(drug));
                        await ctx.stub.putState(drugKey,dataBuffer);
                    }
                    else{
                        throw new Error('Drug not found');
                    }
                }
                let dataBuffer = Buffer.from(JSON.stringify(shipmentObject));
                await ctx.stub.putState(shipmentKey,dataBuffer);
                return shipmentObject;
            }
            else{
                throw new Error('Purchase Order Exists!!');
            }
        }
        else{
            throw new Error('******** Only distributor & Manufacturer can Access ********');
        }
    }

    /**
	* @function updateShipment
	* @decription This function is used by transporter only to update the status of the shipment.
	*
	* @param ctx
    * @param buyerCRN - CRN of the buyer
    * @param drugName - Name of the drug
    * @param transporterCRN - CRN of the transporter
	*
	* @returns Updated Shipment Object
	**/
    async updateShipment(ctx, buyerCRN, drugName, transporterCRN){
      const cid = new ClientIdentity(ctx.stub);
      const userCert = cid.getX509Certificate();
        if (userCert.issuer.organizationName === "transporter.pharma-network.com"){
            const shipmentKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.shipment', [buyerCRN + '-' + drugName]);
            let shipmentBuffer = await ctx.stub.getState(shipmentKey).catch(err => console.log(err));
            let shipment = JSON.parse(shipmentBuffer.toString());
            //Buyer
            let buyerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [buyerCRN]);
            let buyerBuffer = await ctx.stub.getState(buyerKey).catch(err => console.log(err));
            let buyer = JSON.parse(buyerBuffer.toString());
            //Transporter
            let transporterKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [transporterCRN]);
            let transporterBuffer = await ctx.stub.getState(transporterKey).catch(err => console.log(err));
            let transporter = JSON.parse(transporterBuffer.toString());
            //Shipment validity
            if(shipment.length === 0){
                throw new Error('Shipment does not exist');
            }
            else{
                shipment.status = 'Delivered';
                let assets = shipment.assets
                //Shipment List Update
                for ( let i = 0; i< assets.length ; i++){
                    let drugKey =  ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug',[drugName + '-' +assets[i]]);
                    let drugBuffer = await ctx.stub.getState(drugKey).catch(err => console.log(err));
                    let drug = JSON.parse(drugBuffer.toString());
                    if(drugBuffer.length !== 0){
                        drug.shipment = drug.shipment + shipmentKey;
                        drug.owner = buyerKey;
                        let dataBuffer = Buffer.from(JSON.stringify(drug));
                        await ctx.stub.putState(drugKey, dataBuffer);
                    }
                    else{
                        throw new Error('Drug not found');
                    }
                }
                let dataBuffer = Buffer.from(JSON.stringify(shipment));
                await ctx.stub.putState(shipmentKey, dataBuffer);
                return shipment;
            }
        }
        else{
            throw new Error('******** Transporter Only Access ********');
        }
    }

    /**
	* @function retailDrug
	* @decription This function is used by retailer while selling teh drug to a customer.
	*
	* @param ctx
    * @param drugName - Name of the drug
    * @param serialNo - Serial number of the drug
    * @param retailerCRN - CRN of the retailer
    * @param customerAadhar - Aadhar number of the customer
	*
	* @returns updated drug Object
	**/
    async retailDrug(ctx, drugName, serialNo, retailerCRN, customerAadhar){
      const cid = new ClientIdentity(ctx.stub);
      const userCert = cid.getX509Certificate();
        if (userCert.issuer.organizationName === "retailer.pharma-network.com"){
            //Drug
            let drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug', [drugName + '-' + serialNo]);
            let drugBuffer = await ctx.stub.getState(drugKey).catch(err => console.log(err));
            let drug = JSON.parse(drugBuffer.toString());
            //Retailer
            let retailerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [retailerCRN]);
            let retailerBuffer = await ctx.stub.getState(retailerKey).catch(err => console.log(err));
            let retailer = JSON.parse(retailerBuffer.toString());
            //Drug owner && Validity check
            if(drugBuffer.length !== 0){
                if(drug.owner !== retailerKey) {
                    throw new Error('You are not the owner of the drug!!!');
                }
                else{
                    drug.owner = customerAadhar;
                    let dataBuffer = Buffer.from(JSON.stringify(drug));
                    await ctx.stub.putState(drugKey, dataBuffer);
                    return drug;
                }
            }
            else{
                throw new Error('Drug not found!!');
            }
        }
        else{
            throw new Error('******** Retailer Only Access ********');
        }
    }

    //View Lifecycle
    /**
	* @function viewHistory
	* @decription This function is used view the drug history on ledger.
	*
	* @param ctx
    * @param drugName - Name of the drug
    * @param serialNo - Serial number of the drug
	*
	* @returns Transaction history array
	**/
    async viewHistory(ctx, drugName,serialNo){
        let drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug', [drugName + '-' + serialNo]);
        let drugBuffer = await ctx.stub.getState(drugKey).catch(err => console.log(err));
        let drug = JSON.parse(drugBuffer.toString());
        let history = await ctx.stub.getHistoryForKey(drugKey).catch(err => console.log(err));
        let historyArr = [];
        let temp = await history.next();
        while(!temp.done){
            if(temp.value){
                const obj = JSON.parse(temp.value.value.toString('utf8'));
                historyArr.push(obj);
            }
            temp = await history.next();
        }
        await history.close();
        return historyArr;
    }

    /**
	* @function viewDrugCurrentState
	* @decription This function is used view the drug State on ledger.
	*
	* @param ctx
    * @param drugName - Name of the drug
    * @param serialNo - Serial number of the drug
	*
	* @returns Drug Object
	**/
    async viewDrugCurrentState(ctx, drugName,serialNo){
        let drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug', [drugName + '-' + serialNo]);
        let drugBuffer = await ctx.stub.getState(drugKey).catch(err => console.log(err));
        let drug = JSON.parse(drugBuffer.toString());
        if(drugBuffer.length !== 0){
            return drug;
        }
        else{
            throw new Error('Drug not found!!');
        }
    }
}
module.exports = pharmanet;
